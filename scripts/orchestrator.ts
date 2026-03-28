/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

import { ProviderFactory } from './providers/ProviderFactory.js';
import { RemoteProvisioner } from './RemoteProvisioner.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import type { ExecOptions } from './providers/BaseProvider.js';
import { SessionManager } from './utils/SessionManager.js';
import { TempManager } from './utils/TempManager.js';
import { 
  ORBIT_ROOT, 
  SATELLITE_WORKTREES_PATH, 
  POLICIES_PATH, 
  SCRIPTS_PATH, 
} from './Constants.js';


const REPO_ROOT = process.cwd();

/**
 * Loads and parses a local .env file from the repository root and the home directory.
 */
function loadDotEnv(env: NodeJS.ProcessEnv) {
  const envPaths = [
    path.join(REPO_ROOT, '.env'),
    path.join(process.env.HOME || '', '.env')
  ];

  envPaths.forEach(envPath => {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match && match[1] && match[2]) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["'](.*)["']$/, '$1');
          if (!env[key]) env[key] = value;
        }
      });
    }
  });
}

function q(str: string) {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export async function runOrchestrator(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  loadDotEnv(env);
  const promptArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg === '--open') {
      i++; // Skip flag and value
      continue;
    }
    promptArgs.push(arg);
  }

  const prNumber = promptArgs[0];
  const actionArg = promptArgs[1] || 'mission';
  let action = 'mission';
  let customPrompt = '';

  const validActions = ['eva', 'mission', 'fix', 'review', 'implement'];
  if (validActions.includes(actionArg)) {
    action = actionArg;
    customPrompt = promptArgs.slice(2).join(' ');
  } else if (prNumber && prNumber !== 'eva') {
    action = 'mission';
    customPrompt = promptArgs.slice(1).join(' ');
  }

  // Handle "shell" mode: orbit mission eva [identifier]
  const isEvaMode = action === 'eva';

  if (!prNumber) {
    console.error(`
❌ Usage: orbit mission <PR_NUMBER> [action] [prompt...]
   OR:    orbit mission eva [identifier]

Actions:
  (default)  - Launch interactive agent mission.
  shell      - Extra-Vehicular Activity: Ingress into raw bash capsule.
  fix        - Execute automated orbital correction.
  review     - Execute mission observation.
  implement  - Execute mission execution.
    `);
    return 1;
  }

  // 1. Load Settings
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);

  if (!config) {
    console.error(
      `❌ Orbit settings not found for repo: ${repoName}. Run "orbit liftoff" first.`,
    );
    return 1;
  }

  const provider = ProviderFactory.getProvider({
    projectId: config.projectId!,
    zone: config.zone!,
    instanceName: config.instanceName!,
    repoName: config.repoName,
    dnsSuffix: config.dnsSuffix,
    userSuffix: config.userSuffix,
    backendType: config.backendType
  });

  // 2. Wake Station & Verify Capsule
  const readyRes = await provider.ensureReady();
  if (readyRes !== 0) return readyRes;

  // Paths - Unified across station and capsule
  const remotePolicyPath = `${POLICIES_PATH}/orbit-policy.toml`;
  const sessionId = SessionManager.generateSessionId(prNumber, action);
  const sessionName = sessionId; // Standardize on sessionId
  const containerName = `gcli-${prNumber}-${action}`;
  const repoWorktreesDir = `${SATELLITE_WORKTREES_PATH}/${config.repoName}`;
  const upstreamUrl = `https://github.com/${config.upstreamRepo}.git`;

// 3. Remote Preparation
const localApiKey = env.GCLI_ORBIT_GEMINI_API_KEY || env.GEMINI_API_KEY || '';

// 4. Remote Context Setup (Executed INSIDE capsule for path consistency)
const provisioner = new RemoteProvisioner(provider);
const remoteWorktreeDir = await provisioner.provisionWorktree(prNumber, action, isEvaMode, '', {
    remoteWorkDir: config.remoteWorkDir!,
    worktreesDir: repoWorktreesDir,
    upstreamUrl
});
if (!remoteWorktreeDir) {
    console.error('❌ Failed to provision satellite worktree.');
    return 1;
}

// AUTH: Inject credentials directly into the worktree .env
if (localApiKey) {
  console.log('   - Injecting mission authentication context...');
  const dotEnvContent = `GEMINI_API_KEY=${localApiKey}\nGEMINI_AUTO_UPDATE=0\nGEMINI_HOST=${config.instanceName}`;
  const authRes = await provider.exec(
      `sudo docker exec -u node ${containerName} sh -c ${q(`echo ${q(dotEnvContent)} > ${remoteWorktreeDir}/.env`)}`
  );
  if (authRes !== 0) return authRes;
}

// 5. Execution Logic
  const isWithinGemini =
    !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;

  // Handle --open override
  const openIdx = args.indexOf('--open');
  let terminalTarget: 'foreground' | 'background' | 'tab' | 'window' = config.terminalTarget || 'tab';
  if (openIdx !== -1 && args[openIdx + 1]) {
    terminalTarget = args[openIdx + 1] as 'foreground' | 'background' | 'tab' | 'window';
  }

  // FORCE FOREGROUND if requested or if not in a supported terminal
  const forceMainTerminal = terminalTarget === 'foreground';

  // In shell mode, we just start gemini. In action mode, we run the entrypoint.
  const remoteWorker = isEvaMode
    ? `gemini`
    : `tsx ${SCRIPTS_PATH}/entrypoint.ts ${prNumber} . ${remotePolicyPath} ${action} ${q(customPrompt.trim())}`;

  // 6. Persistence vs Raw Execution
  let useTmux = config.useTmux !== false;
  if (useTmux) {
      // Verify tmux presence on the provider
      const tmuxCheck = await provider.getExecOutput('tmux -V', { wrapCapsule: containerName, quiet: true });
      if (tmuxCheck.status !== 0) {
          console.log('   ⚠️ tmux not detected in environment. Falling back to raw execution.');
          useTmux = false;
      }
  }

  const tmuxStyle = `
    tmux set -g status off;
  `.replace(/\n/g, '');

  const tmuxCmd = isEvaMode
    ? `tmux new-session -A -s ${sessionName} ${q(`${tmuxStyle} cd ${remoteWorktreeDir} && ${remoteWorker}; exec $SHELL`)}`
    : `tmux new-session -A -s ${sessionName} ${q(`${tmuxStyle} cd ${remoteWorktreeDir} && ${remoteWorker} || (echo '❌ Mission Failed' && sleep 30)`)}`;

  const rawCmd = isEvaMode
    ? `cd ${remoteWorktreeDir} && ${remoteWorker}; exec $SHELL`
    : `cd ${remoteWorktreeDir} && ${remoteWorker}`;

  const missionCmd = useTmux ? tmuxCmd : rawCmd;

  const execOptions: ExecOptions = {
    interactive: true,
    wrapCapsule: containerName,
    env: {
        COLORTERM: 'truecolor',
        TERM: 'xterm-256color',
        GEMINI_AUTO_UPDATE: '0',
        GEMINI_CLI_HOME: '/home/node',
        GCLI_SESSION_ID: sessionId
    }
  };

  const ghAuthCmd = `(unset GITHUB_TOKEN GH_TOKEN && gh auth status >/dev/null 2>&1) || (unset GITHUB_TOKEN GH_TOKEN && cat ${ORBIT_ROOT}/.gh_token | gh auth login --with-token) || (echo '❌ GitHub Authentication Failed' && exit 1)`;
  
  // If local, we likely don't need the gh token cat thing if we are already authed
  const isLocal = config.providerType === 'local-worktree';
  const fullCommand = isLocal ? missionCmd : `${ghAuthCmd} && ${missionCmd}`;

  const finalSSH = provider.getRunCommand(fullCommand, execOptions);

  const tempManager = new TempManager(config);

  if (
    !forceMainTerminal &&
    isWithinGemini &&
    env.TERM_PROGRAM === 'iTerm.app'
  ) {
    const sessionDir = tempManager.getDir(sessionId);
    const tempCmdPath = path.join(sessionDir, 'launch.sh');
    
    fs.writeFileSync(tempCmdPath, `#!/bin/bash\n${finalSSH}\nrm "$0"`, {
      mode: 0o755,
    });

    const appleScript =
      terminalTarget === 'window'
        ? `
                on run argv
                tell application "iTerm"
                    set newWindow to (create window with default profile)
                    tell current session of newWindow
                    write text (quoted form of item 1 of argv) & return
                    end tell
                    activate
                end tell
                end run
            `
        : `
                on run argv
                tell application "iTerm"
                    tell current window
                    set newTab to (create tab with default profile)
                    tell current session of newTab
                        write text (quoted form of item 1 of argv) & return
                    end tell
                    end tell
                    activate
                end tell
                end run
            `;
    spawnSync('osascript', ['-', tempCmdPath], { input: appleScript });
    console.log(`✅ iTerm2 ${terminalTarget} opened for mission ${prNumber}.`);
    
    // Allow small delay for iTerm to read the file before we potentially clean up the directory
    setTimeout(() => tempManager.cleanup(sessionId), 2000);
    return 0;
  }

  // Fallback: Run in current terminal
  console.log(`📡 Uplinking to session ${sessionName}...`);
  const finalRes = spawnSync(finalSSH, { stdio: 'inherit', shell: true });

  return finalRes.status ?? 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestrator(process.argv.slice(2)).then(code => process.exit(code || 0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

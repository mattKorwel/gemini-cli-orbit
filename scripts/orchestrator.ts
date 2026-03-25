/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

import { ProviderFactory } from './providers/ProviderFactory.ts';
import { RemoteProvisioner } from './RemoteProvisioner.ts';
import { 
  WORKSPACES_ROOT, 
  MAIN_REPO_PATH, 
  WORKTREES_PATH, 
  POLICIES_PATH, 
  SCRIPTS_PATH, 
  CONFIG_DIR,
  UPSTREAM_REPO_URL,
  type WorkspaceConfig 
} from './Constants.ts';


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
        if (match) {
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
    if (args[i] === '--open') {
      i++; // Skip flag and value
      continue;
    }
    promptArgs.push(args[i]);
  }

  let prNumber = promptArgs[0];
  let actionArg = promptArgs[1] || 'open';
  let action = 'open';
  let customPrompt = '';

  const validActions = ['shell', 'open'];
  if (validActions.includes(actionArg)) {
    action = actionArg;
    customPrompt = promptArgs.slice(2).join(' ');
  } else if (prNumber && prNumber !== 'shell') {
    action = 'open';
    customPrompt = promptArgs.slice(1).join(' ');
  }

  // Handle "shell" mode: workspace shell [identifier]
  const isShellMode = prNumber === 'shell';
  if (isShellMode) {
    prNumber = args[1] || `adhoc-${Math.floor(Math.random() * 10000)}`;
    action = 'shell';
  }

  if (!prNumber) {
    console.error(`
❌ Usage: workspace <PR_NUMBER> [prompt...]
   OR:    workspace shell [identifier]

Actions:
  (default)  - Drop into an interactive Gemini session. Supports optional prompt.
  shell      - Drop into a raw bash shell (no agent).
    `);
    return 1;
  }

  // 1. Load Settings
  const settingsPath = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');
  if (!fs.existsSync(settingsPath)) {
    console.error(
      '❌ Workspace settings not found. Run "workspace setup" first.',
    );
    return 1;
  }
  const settings: { workspace: WorkspaceConfig } = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.workspace;

  const targetVM = `gcli-workspace-${env.USER || 'gcli-user'}`;
  const provider = ProviderFactory.getProvider({
    projectId: config.projectId,
    zone: config.zone,
    instanceName: targetVM,
  });

  // 2. Wake Worker & Verify Container
  await provider.ensureReady();

  // Retrieve the remote user to ensure we run git commands correctly
  await provider.getExecOutput('whoami');

  // Paths - Unified across host and container
  const remotePolicyPath = `${POLICIES_PATH}/workspace-policy.toml`;
  const timestamp = Date.now();
  const sessionName = `workspace-${prNumber}-${action}-${timestamp}`;
  const containerName = `gcli-${prNumber}-${action}`;
  const hostWorktreeDir = `${WORKTREES_PATH}/workspace-${prNumber}-${action}`;
// 3. Remote Preparation
const localApiKey = env.WORKSPACE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';

// 4. Remote Context Setup (Executed INSIDE container for path consistency)
const provisioner = new RemoteProvisioner(provider);
// We don't pass ghEnv anymore as we auth inside the container's main command
const remoteWorktreeDir = await provisioner.provisionWorktree(prNumber, action, isShellMode, '');

// AUTH: Inject credentials directly into the worktree .env
if (localApiKey) {
  console.log('   - Injecting remote authentication context...');
  const dotEnvContent = `GEMINI_API_KEY=${localApiKey}\nGEMINI_AUTO_UPDATE=0\nGEMINI_HOST=${targetVM}`;
  await provider.exec(
      `sudo docker exec -u node ${containerName} sh -c ${q(`echo ${q(dotEnvContent)} > ${remoteWorktreeDir}/.env`)}`
  );
}

// 5. Execution Logic
  const isWithinGemini =
    !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;

  // Handle --open override
  const openIdx = args.indexOf('--open');
  let terminalTarget = config.terminalTarget || 'tab';
  if (openIdx !== -1 && args[openIdx + 1]) {
    terminalTarget = args[openIdx + 1];
  }

  // FORCE FOREGROUND if requested or if not in a supported terminal
  const forceMainTerminal = terminalTarget === 'foreground';

  // In shell mode, we just start gemini. In action mode, we run the entrypoint.
  const remoteWorker = isShellMode
    ? `gemini`
    : `tsx ${SCRIPTS_PATH}/entrypoint.ts ${prNumber} . ${remotePolicyPath} ${action} ${q(customPrompt.trim())}`;

  // PERSISTENCE: Wrap the entire execution in a tmux session inside the container
  const tmuxStyle = `
    tmux set -g status off;
  `.replace(/\n/g, '');

  const tmuxCmd = `tmux new-session -A -s ${sessionName} ${q(`${tmuxStyle} cd ${remoteWorktreeDir} && ${remoteWorker} || (echo '❌ Command Failed' && sleep 30); exec $SHELL`)}`;

  // GH AUTH: Ensure the containerized GH CLI is authorized for the node user
  const ghLoginCmd = `(gh auth status >/dev/null 2>&1 || (unset GITHUB_TOKEN GH_TOKEN && gh auth login --with-token < ${WORKSPACES_ROOT}/.gh_token)) && `;

  const containerWrap = `sudo docker exec -it -u node \
    -e COLORTERM=truecolor \
    -e TERM=xterm-256color \
    -e GEMINI_AUTO_UPDATE=0 \
    -e GEMINI_CLI_HOME=/home/node \
    ${containerName} sh -c ${q(`(unset GITHUB_TOKEN GH_TOKEN && gh auth status >/dev/null 2>&1) || (unset GITHUB_TOKEN GH_TOKEN && cat ${WORKSPACES_ROOT}/.gh_token | gh auth login --with-token) || (echo '❌ GitHub Authentication Failed' && exit 1) && ${tmuxCmd}`)}`;

  const finalSSH = provider.getRunCommand(containerWrap, { interactive: true });

  if (
    !forceMainTerminal &&
    isWithinGemini &&
    env.TERM_PROGRAM === 'iTerm.app'
  ) {
    const tempCmdPath = path.join(
      process.env.TMPDIR || '/tmp',
      `workspace-ssh-${prNumber}.sh`,
    );
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
    console.log(`✅ iTerm2 ${terminalTarget} opened for job ${prNumber}.`);
    return 0;
  }

  // Fallback: Run in current terminal
  console.log(`📡 Connecting to session ${sessionName}...`);
  spawnSync(finalSSH, { stdio: 'inherit', shell: true });

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOrchestrator(process.argv.slice(2)).catch(console.error);
}

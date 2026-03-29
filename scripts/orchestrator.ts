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
import {
  getRepoConfig,
  detectRepoName,
  sanitizeName,
} from './ConfigManager.js';
import type { ExecOptions } from './providers/BaseProvider.js';
import { SessionManager } from './utils/SessionManager.js';
import { TempManager } from './utils/TempManager.js';
import {
  ORBIT_ROOT,
  SATELLITE_WORKTREES_PATH,
  POLICIES_PATH,
  SCRIPTS_PATH,
  LOCAL_SCRIPTS_PATH,
  LOCAL_POLICIES_PATH,
  LOCAL_BUNDLE_PATH,
  BUNDLE_PATH,
  getPrimaryRepoRoot,
} from './Constants.js';

const REPO_ROOT = process.cwd();

/**
 * Loads and parses a local .env file from the repository root and the home directory.
 */
function loadDotEnv(env: NodeJS.ProcessEnv) {
  const envPaths = [
    path.join(REPO_ROOT, '.env'),
    path.join(process.env.HOME || '', '.env'),
  ];

  envPaths.forEach((envPath) => {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach((line) => {
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

  // 1. Resolve Repo & Config FIRST for context-aware help
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);

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

  const identifier = promptArgs[0];
  const actionArg = promptArgs[1] || 'mission';
  let action = 'mission';
  let customPrompt = '';

  const validActions = ['eva', 'mission', 'fix', 'review', 'implement'];
  if (validActions.includes(actionArg)) {
    action = actionArg;
    customPrompt = promptArgs.slice(2).join(' ');
  } else if (identifier && identifier !== 'eva') {
    action = 'mission';
    customPrompt = promptArgs.slice(1).join(' ');
  }

  // Handle "shell" mode: orbit mission eva [identifier]
  const isEvaMode = action === 'eva';

  if (!identifier) {
    const isLocalMode = config?.providerType === 'local-worktree';
    const cmdPrefix = isLocalMode ? 'gml' : 'gm';

    console.log(`
🚀 GEMINI ORBIT: MISSION CONTROL

Usage: ${cmdPrefix} <IDENTIFIER> [action] [prompt...]

IDENTIFIER:
  - A Pull Request number (e.g., 20)
  - A branch name (e.g., feat-mcp)

ACTIONS:
  review    - (Default) Parallel analysis, build, and behavioral proof.
  fix       - Iterative CI repair and conflict resolution.
  implement - Autonomous feature execution with test-first logic.
  eva       - Ingress into a raw bash session inside the capsule.

EXAMPLES:
  ${cmdPrefix} 20 review
  ${cmdPrefix} feat-mcp fix "fix the lint errors"

${isLocalMode ? '📍 [LOCAL MODE]: Worktrees will be created as siblings in your project directory.' : '☁️ [REMOTE MODE]: Missions will be offloaded to your Orbit Cloud Station.'}

Current Repo: ${repoName || 'Not Detected'}
    `);
    return 0;
  }

  const instanceName = config.instanceName || 'local';
  const provider = ProviderFactory.getProvider({
    ...config,
    projectId: config.projectId || 'local',
    zone: config.zone || 'local',
    instanceName,
  });

  // 2. Wake Station & Verify Capsule
  const readyRes = await provider.ensureReady();
  if (readyRes !== 0) return readyRes;

  const isLocalWorktree = provider.type === 'local-worktree';

  // Paths - Unified across station and capsule
  const remotePolicyPath = isLocalWorktree
    ? LOCAL_POLICIES_PATH
    : `${POLICIES_PATH}/orbit-policy.toml`;
  const sessionId = SessionManager.generateSessionId(identifier, action);

  // Resolve branch for naming consistency
  let branch = identifier;
  if (/^\d+$/.test(identifier)) {
    const res = spawnSync(
      'gh',
      ['pr', 'view', identifier, '--json', 'headRefName', '-q', '.headRefName'],
      { stdio: 'pipe' },
    );
    if (res.status === 0) branch = res.stdout.toString().trim();
  }

  const sessionName = sessionId; // Standardize on sessionId
  const containerName = isLocalWorktree
    ? branch
    : `gcli-${sanitizeName(identifier)}-${action}`;
  const repoWorktreesDir = `${SATELLITE_WORKTREES_PATH}/${config.repoName}`;
  const upstreamUrl = `https://github.com/${config.upstreamRepo}.git`;

  const effectiveScriptsPath = isLocalWorktree
    ? LOCAL_SCRIPTS_PATH
    : SCRIPTS_PATH;
  const effectiveBundlePath = isLocalWorktree ? LOCAL_BUNDLE_PATH : BUNDLE_PATH;

  // 3. Remote Preparation
  const localApiKey = env.GCLI_ORBIT_GEMINI_API_KEY || env.GEMINI_API_KEY || '';

  // 4. Remote Context Setup (Executed INSIDE capsule for path consistency)
  const provisioner = new RemoteProvisioner(provider);
  const remoteWorktreeDir = await provisioner.provisionWorktree(
    identifier,
    action,
    isEvaMode,
    '',
    {
      remoteWorkDir: config.remoteWorkDir!,
      worktreesDir: repoWorktreesDir,
      upstreamUrl,
      cpuLimit: config.cpuLimit,
      memoryLimit: config.memoryLimit,
      image: isLocalWorktree ? getPrimaryRepoRoot() : config.imageUri,
    } as any,
  );

  if (!remoteWorktreeDir) {
    console.error('❌ Failed to provision Orbit capsule.');
    return 1;
  }

  // AUTH: Inject credentials directly into the worktree .env
  if (localApiKey) {
    console.log('   - Injecting mission authentication context...');
    const dotEnvContent = `GEMINI_API_KEY=${localApiKey}\nGEMINI_AUTO_UPDATE=0\nGEMINI_HOST=${config.instanceName || 'local'}`;

    // Use the provider's abstraction instead of hardcoding docker
    const authRes = await provider.exec(`echo ${q(dotEnvContent)} > .env`, {
      wrapCapsule: containerName,
    });
    if (authRes !== 0) return authRes;
  }

  // 5. Execution Logic
  const isWithinGemini =
    !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;

  // Handle --open override
  const openIdx = args.indexOf('--open');
  let terminalTarget: 'foreground' | 'background' | 'tab' | 'window' =
    config.terminalTarget || 'tab';
  if (openIdx !== -1 && args[openIdx + 1]) {
    terminalTarget = args[openIdx + 1] as
      | 'foreground'
      | 'background'
      | 'tab'
      | 'window';
  }

  const forceMainTerminal = terminalTarget === 'foreground';

  // In shell mode, we just start gemini. In action mode, we run the entrypoint.
  const remoteWorker = isEvaMode
    ? `gemini`
    : `node ${effectiveBundlePath}/entrypoint.js ${identifier} . ${remotePolicyPath} ${action} ${q(customPrompt.trim())}`;

  // Helper: Check if tmux is installed
  const hasTmux = spawnSync('which', ['tmux'], { stdio: 'pipe' }).status === 0;

  // We wrap in tmux for persistence
  const missionCmd =
    config.useTmux !== false && hasTmux
      ? `tmux new-session -A -s ${q(`orbit-${branch}`)} ${q(remoteWorker)}`
      : remoteWorker;

  const execOptions: ExecOptions = {
    interactive: true,
    wrapCapsule: containerName,
    env: {
      COLORTERM: 'truecolor',
      TERM: 'xterm-256color',
      GEMINI_AUTO_UPDATE: '0',
      GEMINI_CLI_HOME: isLocalWorktree
        ? process.env.HOME || '/home/node'
        : '/home/node',
      GCLI_SESSION_ID: sessionId,
    },
  };

  const ghAuthCmd = `(unset GITHUB_TOKEN GH_TOKEN && gh auth status >/dev/null 2>&1) || (unset GITHUB_TOKEN GH_TOKEN && cat ${ORBIT_ROOT}/.gh_token | gh auth login --with-token) || (echo '❌ GitHub Authentication Failed' && exit 1)`;

  const fullCommand = isLocalWorktree
    ? missionCmd
    : `${ghAuthCmd} && ${missionCmd}`;
  const finalSSH = provider.getRunCommand(fullCommand, execOptions);
  const tempManager = new TempManager(config);

  if (
    !forceMainTerminal &&
    isWithinGemini &&
    env.TERM_PROGRAM === 'iTerm.app'
  ) {
    const sessionDir = tempManager.getDir(sessionId);
    const tempCmdPath = path.join(sessionDir, 'launch.sh');
    fs.writeFileSync(
      tempCmdPath,
      `#!/bin/bash
echo -e "\\033]50;SetProfile=Orbit\\a"
clear
echo "🚀 Orbit Mission: ${identifier} (${action})"
echo "--------------------------------------------------"
${finalSSH}
`,
    );
    fs.chmodSync(tempCmdPath, 0o755);

    console.log(`\n✨ Orbit mission ${identifier} ready.`);
    console.log(`📂 Launching in isolated iTerm2 tab...`);

    const appleScript = `
      tell application "iTerm"
        tell current window
          create tab with default profile
          tell current session
            write text "${tempCmdPath} && exit"
          end tell
        end tell
      end tell
    `;
    spawnSync('osascript', ['-e', appleScript]);
    return 0;
  }

  // DEFAULT: Run in-place
  console.log(`\n🚀 Launching Orbit Mission: ${identifier} (${action})...\n`);
  return provider.exec(fullCommand, execOptions);
}

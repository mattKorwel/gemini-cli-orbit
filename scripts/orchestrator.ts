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
import { resolveMissionContext } from './utils/MissionUtils.js';
import { TempManager } from './utils/TempManager.js';
import { StationManager } from './StationManager.js';
import {
  SATELLITE_WORKTREES_PATH,
  POLICIES_PATH,
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

  // SAFETY: Check if the identifier is actually another Orbit command
  const reserved = [
    'schematic',
    'station',
    'liftoff',
    'pulse',
    'uplink',
    'jettison',
    'reap',
    'splashdown',
    'ci',
    'logs',
    'blackbox',
    'install-shell',
    'install_shell',
  ];
  if (identifier && reserved.includes(identifier)) {
    console.error(
      `\n❌ Error: "${identifier}" is an Orbit command, not a mission identifier.`,
    );
    console.error(
      `👉 Did you mean to run "orbit ${identifier}" instead of a mission?\n`,
    );
    return 1;
  }

  const actionArg = promptArgs[1];
  let action = 'chat'; // New Default: Interactive Gemini
  let customPrompt = '';

  const maneuvers = ['fix', 'review', 'implement'];
  const interactions = ['chat', 'eva', 'shell'];

  if (actionArg && maneuvers.includes(actionArg)) {
    action = actionArg;
    customPrompt = promptArgs.slice(2).join(' ');
  } else if (actionArg && interactions.includes(actionArg)) {
    action = actionArg;
    customPrompt = promptArgs.slice(2).join(' ');
  } else if (identifier) {
    action = 'chat';
    customPrompt = promptArgs.slice(1).join(' ');
  }

  // Handle "shell" mode: orbit mission eva [identifier]
  const isEvaMode = action === 'eva' || action === 'chat';

  if (!identifier) {
    return 0; // Handled by orbit-cli.ts
  }

  const instanceName = config.instanceName || 'local';
  const provider = ProviderFactory.getProvider({
    ...config,
    projectId: config.projectId || 'local',
    zone: config.zone || 'local',
    instanceName,
  });

  const isLocalWorktree = provider.type === 'local-worktree';

  // Paths - Unified across station and capsule
  const remotePolicyPath = isLocalWorktree
    ? LOCAL_POLICIES_PATH
    : `${POLICIES_PATH}/orbit-policy.toml`;
  const sessionId = SessionManager.generateSessionId(identifier, action);

  const mCtx = resolveMissionContext(identifier, action);
  const branch = mCtx.branchName;
  const containerName = isLocalWorktree ? branch : mCtx.containerName;

  const repoWorktreesDir = `${SATELLITE_WORKTREES_PATH}/${config.repoName}`;
  const upstreamUrl = `https://github.com/${config.upstreamRepo}.git`;

  const effectiveBundlePath = isLocalWorktree ? LOCAL_BUNDLE_PATH : BUNDLE_PATH;

  // 3. Command Definition
  const localApiKey = env.GCLI_ORBIT_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
  const isWithinGemini =
    !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;

  // In shell mode, we just start gemini. In action mode, we run the entrypoint.
  let remoteWorker = '';
  if (action === 'chat' || action === 'eva') {
    remoteWorker = customPrompt.trim()
      ? `gemini -i ${q(customPrompt.trim())}`
      : `gemini`;
  } else if (action === 'shell') {
    remoteWorker = `/bin/bash`;
  } else {
    remoteWorker = `node ${effectiveBundlePath}/entrypoint.js ${identifier} . ${remotePolicyPath} ${action} ${q(customPrompt.trim())}`;
  }

  // Helper: Check if tmux is installed
  const hasTmux = spawnSync('which', ['tmux'], { stdio: 'pipe' }).status === 0;

  // We wrap in tmux for persistence ONLY for remote.
  const missionCmd =
    !isLocalWorktree && config.useTmux !== false && hasTmux
      ? `tmux new-session -A -s ${q(mCtx.sessionName)} ${q(remoteWorker)}`
      : remoteWorker;

  const secretPath = `/dev/shm/.gcli-env-${sessionId}`;
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
      // Pass the API key through the process environment for local missions
      ...(isLocalWorktree && localApiKey
        ? { GEMINI_API_KEY: localApiKey }
        : {}),
    },
  };

  const ghAuthCmd = `(unset GITHUB_TOKEN GH_TOKEN && gh auth status >/dev/null 2>&1) || (unset GITHUB_TOKEN GH_TOKEN && test -f ${secretPath} && source ${secretPath} && cat ${secretPath} | grep GITHUB_TOKEN | cut -d= -f2- | gh auth login --with-token) || (echo '❌ GitHub Authentication Failed' && exit 1)`;

  const fullCommand = isLocalWorktree
    ? missionCmd
    : `${ghAuthCmd} && ${missionCmd}`;

  // 4. Optimistic Execution (Fast-path for active stations)
  if (!isLocalWorktree) {
    const optimisticRes = await provider.exec(fullCommand, {
      ...execOptions,
      quiet: true, // Don't show errors on the first attempt
    });

    if (optimisticRes === 0) {
      return 0; // Mission launched successfully!
    }

    if (optimisticRes !== 255) {
      // If it's NOT a connectivity error (255), then the capsule might just be missing.
      // We proceed to the full preparation logic.
    }
  }

  // 5. Full Preparation (Slow-path: Waking & Provisioning)
  const readyRes = await provider.ensureReady();
  if (readyRes !== 0) return readyRes;

  // AUTH: Inject credentials for remote missions (ADR 14)
  if (!isLocalWorktree) {
    let githubToken = '';
    try {
      const ghRes = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' });
      if (ghRes.status === 0) githubToken = ghRes.stdout.trim();
    } catch (_e) {}

    console.log('   - Injecting mission authentication context (RAM-disk)...');
    let dotEnvContent = `GEMINI_API_KEY=${localApiKey}\nGEMINI_AUTO_UPDATE=0\nGEMINI_HOST=${config.instanceName || 'local'}`;
    if (githubToken) {
      dotEnvContent += `\nGITHUB_TOKEN=${githubToken}`;
    }

    const authRes = await provider.exec(
      `echo ${q(dotEnvContent)} > ${secretPath} && chmod 600 ${secretPath}`,
      {},
    );
    if (authRes !== 0) return authRes;
  }

  // Remote Context Setup (Executed INSIDE capsule for path consistency)
  const provisioner = new RemoteProvisioner(provider);
  const remoteWorktreeDir = await provisioner.provisionWorktree(
    identifier,
    action,
    isEvaMode,
    '',
    {
      remoteWorkDir: config.remoteWorkDir || getPrimaryRepoRoot(),
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

  // Save Terrestrial Station Receipt for Local Worktrees
  if (isLocalWorktree) {
    const stationManager = new StationManager();
    stationManager.saveReceipt({
      name: `local-${repoName}`,
      type: 'local-worktree',
      projectId: 'local',
      zone: 'localhost',
      repo: repoName,
      rootPath: getPrimaryRepoRoot(),
      lastSeen: new Date().toISOString(),
    });
  }

  // 6. Final Launch
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
echo "🚀 Station: ${config.instanceName}"
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
  console.log(`\n🛰️  Station: ${config.instanceName}`);
  console.log(`🚀 Launching Orbit Mission: ${identifier} (${action})...\n`);
  try {
    return await provider.exec(fullCommand, execOptions);
  } finally {
    // Cleanup RAM-disk credential file after mission exits (ADR 14)
    if (!isLocalWorktree) {
      await provider.exec(`rm -f ${secretPath}`, {}).catch(() => {});
    }
  }
}

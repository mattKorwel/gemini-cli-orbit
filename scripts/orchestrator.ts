/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

import { ProviderFactory } from './providers/ProviderFactory.ts';


const REPO_ROOT = process.cwd();

function q(str: string) {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export async function runOrchestrator(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
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
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.workspace;

  const targetVM = `gcli-workspace-${env.USER || 'mattkorwel'}`;
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
  const hostWorkspaceRoot = `/mnt/disks/data`;
  const hostWorkDir = `${hostWorkspaceRoot}/main`;
  const containerWorkspaceRoot = `/mnt/disks/data`;

  const remotePolicyPath = `${containerWorkspaceRoot}/policies/workspace-policy.toml`;
  const persistentScripts = `${containerWorkspaceRoot}/scripts`;
  const timestamp = Date.now();
  const sessionName = `workspace-${prNumber}-${action}-${timestamp}`;
  const remoteWorktreeDir = `${containerWorkspaceRoot}/worktrees/workspace-${prNumber}-${action}`;
  const hostWorktreeDir = `${hostWorkspaceRoot}/worktrees/workspace-${prNumber}-${action}`;

  // 3. Authentication & UI Context (Retrieve from host, inject to container)
  const remoteConfigPath = `${hostWorkspaceRoot}/gemini-cli-config/.gemini/settings.json`;
  const remoteSettingsRes = await provider.getExecOutput(
    `cat ${remoteConfigPath}`,
  );
  const remoteSettingsJson = remoteSettingsRes.stdout.trim();

  const apiKeyRes = await provider.getExecOutput(
    `cat ${remoteConfigPath} | grep apiKey | cut -d '"' -f 4`,
  );
  const remoteApiKey = apiKeyRes.stdout.trim();

  const ghTokenRes = await provider.getExecOutput(
    `cat ${hostWorkspaceRoot}/.gh_token`,
  );
  const remoteGhToken = ghTokenRes.stdout.trim();

  // AUTH: Inject credentials and settings directly into the worktree
  console.log('   - Injecting remote authentication and UI context...');
  const dotEnvContent = `
GEMINI_API_KEY=${remoteApiKey}
COLORTERM=truecolor
TERM=xterm-256color
GEMINI_AUTO_UPDATE=0
GEMINI_HOST=${targetVM}
`.trim();

  const ghEnv = remoteGhToken ? `-e GITHUB_TOKEN=${remoteGhToken} -e GH_TOKEN=${remoteGhToken} ` : '';

  // 4. Remote Context Setup (Executed INSIDE container for path consistency)
  const containerWorkDir = `/mnt/disks/data/main`;
  const containerWorktreeDir = `/mnt/disks/data/worktrees/workspace-${prNumber}-${action}`;

  // Clear previous history for this session if it exists to ensure a fresh start
  const isolatedConfigDir = `/mnt/disks/data/gemini-cli-config/.gemini`;
  const clearHistoryCmd = `rm -f ${isolatedConfigDir}/history/workspace-${prNumber}-${action}*`;
  await provider.exec(clearHistoryCmd, { wrapContainer: 'maintainer-worker' });

  // Use the container-safe path for check
  const check = await provider.getExecOutput(`ls -d ${containerWorktreeDir}/.git`, { wrapContainer: 'maintainer-worker' });

  if (check.status !== 0) {
    console.log(`   - Provisioning isolated git worktree for ${prNumber} (inside container)...`);

    // Ensure the main repo exists inside the container
    const repoCheck = await provider.getExecOutput(`ls -d ${containerWorkDir}/.git`, { wrapContainer: 'maintainer-worker' });
    if (repoCheck.status !== 0) {
        console.log(`   - Initializing main repository inside container...`);
        const initRepoCmd = `
          rm -rf ${containerWorkDir} && \
          git clone --quiet --filter=blob:none https://github.com/google-gemini/gemini-cli.git ${containerWorkDir} && \
          cd ${containerWorkDir} && \
          git remote add upstream https://github.com/google-gemini/gemini-cli.git && \
          git fetch --quiet upstream
        `;
        const initRes = await provider.getExecOutput(`sudo docker exec -u node ${ghEnv}maintainer-worker sh -c ${q(initRepoCmd)}`);
        if (initRes.status !== 0) {
            console.error('   ❌ Failed to initialize main repository inside container.');
            console.error('   STDOUT:', initRes.stdout);
            console.error('   STDERR:', initRes.stderr);
            return 1;
        }
    }

    const gitFetch = isShellMode
      ? `git -C ${containerWorkDir} fetch --quiet origin`
      : `git -C ${containerWorkDir} fetch --quiet upstream pull/${prNumber}/head`;

    const gitTarget = 'FETCH_HEAD';

    // Ensure the worktrees parent directory is owned by node
    await provider.exec(`sudo mkdir -p /mnt/disks/data/worktrees && sudo chown -R 1000:1000 /mnt/disks/data/worktrees`);

    // If the directory exists but .git is missing, it's broken. Wipe it.
    const setupCmd = `
      mkdir -p /mnt/disks/data/worktrees && \
      (git -C ${containerWorkDir} worktree remove -f ${containerWorktreeDir} || rm -rf ${containerWorktreeDir}) 2>/dev/null && \
      ${gitFetch} && \
      git -C ${containerWorkDir} worktree add --quiet -f ${containerWorktreeDir} ${gitTarget}
    `;
    const setupRes = await provider.getExecOutput(`sudo docker exec -u node ${ghEnv}maintainer-worker sh -c ${q(setupCmd)}`);
    if (setupRes.status !== 0) {
      console.error('   ❌ Failed to provision remote worktree inside container.');
      console.error('   STDOUT:', setupRes.stdout);
      console.error('   STDERR:', setupRes.stderr);
      return 1;
    }
    console.log('   ✅ Worktree provisioned successfully.');
  } else {
    console.log('   ✅ Remote worktree ready.');
  }

  await provider.exec(`sudo chown -R 1000:1000 ${remoteWorktreeDir}`);
  await provider.exec(
    `sudo docker exec -u node maintainer-worker sh -c ${q(`echo ${q(dotEnvContent)} > ${remoteWorktreeDir}/.env`)}`,
  );

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
    : `tsx ${persistentScripts}/entrypoint.ts ${prNumber} . ${remotePolicyPath} ${action} ${q(customPrompt.trim())}`;

  // PERSISTENCE: Wrap the entire execution in a tmux session inside the container
  const tmuxStyle = `
    tmux set -g status off;
  `.replace(/\n/g, '');

  const tmuxCmd = `tmux new-session -A -s ${sessionName} ${q(`${tmuxStyle} cd ${remoteWorktreeDir} && ${remoteWorker} || (echo '❌ Command Failed' && sleep 30); exec $SHELL`)}`;

  // GH AUTH: Ensure the containerized GH CLI is authorized for the node user
  const ghLoginCmd = `(gh auth status >/dev/null 2>&1 || (unset GITHUB_TOKEN GH_TOKEN && gh auth login --with-token < /mnt/disks/data/.gh_token)) && `;

  const containerWrap = `sudo docker exec -it -u node \
    -e COLORTERM=truecolor \
    -e TERM=xterm-256color \
    -e GEMINI_AUTO_UPDATE=0 \
    maintainer-worker sh -c ${q(`(unset GITHUB_TOKEN GH_TOKEN && gh auth status >/dev/null 2>&1) || (unset GITHUB_TOKEN GH_TOKEN && gh auth login --with-token < /mnt/disks/data/.gh_token) || (echo '❌ GitHub Authentication Failed' && exit 1) && ${tmuxCmd}`)}`;

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

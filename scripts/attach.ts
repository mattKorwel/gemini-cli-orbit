/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

import { ProviderFactory } from './providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import { SessionManager } from './utils/SessionManager.js';
import { resolveMissionContext } from './utils/MissionUtils.js';
import { TempManager } from './utils/TempManager.js';

const q = (str: string) => `'${str.replace(/'/g, "'\\''")}'`;

export async function runAttach(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const identifier = args[0];
  const action = args[1] || 'review';
  const isLocal = args.includes('--local');

  if (!identifier) {
    console.error('Usage: orbit attach <IDENTIFIER> [action] [--local]');
    return 1;
  }

  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);

  if (!config) {
    console.error(
      `❌ Settings not found for repo: ${repoName}. Run "orbit setup" first.`,
    );
    return 1;
  }

  const { projectId, zone, dnsSuffix, userSuffix, backendType, instanceName } =
    config;
  const provider = ProviderFactory.getProvider({
    projectId: projectId!,
    zone: zone!,
    instanceName: instanceName!,
    repoName,
    dnsSuffix,
    userSuffix,
    backendType,
  });

  const sessionId = SessionManager.generateSessionId(
    identifier,
    `attach-${action}`,
  );
  const mCtx = resolveMissionContext(identifier, action);
  const isLocalWorktree = provider.type === 'local-worktree';
  const containerName = isLocalWorktree ? mCtx.branchName : mCtx.containerName;
  const sessionName = mCtx.sessionName;

  const containerAttach = `sudo docker exec -it ${containerName} sh -c ${q(`tmux attach-session -t ${sessionName}`)}`;
  const finalSSH = provider.getRunCommand(containerAttach, {
    interactive: true,
    wrapCapsule: containerName,
  });

  const tempManager = new TempManager(config);

  console.log(`🔗 Attaching to session: ${sessionName}...`);

  const isWithinGemini =
    !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;
  if (isWithinGemini && !isLocal) {
    const sessionDir = tempManager.getDir(sessionId);
    const tempCmdPath = path.join(sessionDir, 'launch.sh');

    fs.writeFileSync(tempCmdPath, `#!/bin/bash\n${finalSSH}\nrm "$0"`, {
      mode: 0o755,
    });

    const appleScript = `
      on run argv
        tell application "iTerm"
          tell current window
            set newTab to (create tab with default profile)
            tell current session of newTab
              write text (item 1 of argv) & return
            end tell
          end tell
          activate
        end tell
      end run
    `;
    const res = spawnSync('osascript', ['-', tempCmdPath], {
      input: appleScript,
    });
    if (res.status === 0) {
      console.log(`✅ iTerm2 tab opened for ${sessionName}.`);
      setTimeout(() => tempManager.cleanup(sessionId), 2000);
      return 0;
    }
    console.warn(
      '⚠️  AppleScript failed to open new tab. Falling back to current terminal.',
    );
  }

  const finalRes = spawnSync(finalSSH, { stdio: 'inherit', shell: true });
  return finalRes.status ?? 0;
}

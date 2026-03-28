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

const q = (str: string) => `'${str.replace(/'/g, "'\\''")}'`;

export async function runAttach(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const prNumber = args[0];
  const action = args[1] || 'review';
  const isLocal = args.includes('--local');

  if (!prNumber) {
    console.error('Usage: orbit attach <PR_NUMBER> [action] [--local]');
    return 1;
  }

  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  
  if (!config) {
    console.error(`❌ Settings not found for repo: ${repoName}. Run "orbit setup" first.`);
    return 1;
  }

  const { projectId, zone, dnsSuffix, userSuffix, backendType, instanceName } = config;
  const provider = ProviderFactory.getProvider({
    projectId: projectId!,
    zone: zone!,
    instanceName: instanceName!,
    repoName,
    dnsSuffix,
    userSuffix,
    backendType
  });

  const containerName = `gcli-${prNumber}-${action}`;
  const sessionName = `orbit-${prNumber}-${action}`;
  const containerAttach = `sudo docker exec -it ${containerName} sh -c ${q(`tmux attach-session -t ${sessionName}`)}`;
  const finalSSH = provider.getRunCommand(containerAttach, {
    interactive: true,
  });

  console.log(`🔗 Attaching to session: ${sessionName}...`);

  const isWithinGemini =
    !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;
  if (isWithinGemini && !isLocal) {
    const tempCmdPath = path.join(
      process.env.TMPDIR || '/tmp',
      `orbit-attach-${prNumber}.sh`,
    );
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
    const res = spawnSync('osascript', ['-', tempCmdPath], { input: appleScript });
    if (res.status === 0) {
        console.log(`✅ iTerm2 tab opened for ${sessionName}.`);
        return 0;
    }
    console.warn('⚠️  AppleScript failed to open new tab. Falling back to current terminal.');
  }

  const finalRes = spawnSync(finalSSH, { stdio: 'inherit', shell: true });
  return finalRes.status ?? 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAttach(process.argv.slice(2)).then(code => process.exit(code || 0)).catch(err => {
      console.error(err);
      process.exit(1);
  });
}

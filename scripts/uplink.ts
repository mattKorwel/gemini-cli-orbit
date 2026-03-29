/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderFactory } from './providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import { 
  SATELLITE_WORKTREES_PATH, 
} from './Constants.js';

export async function runUplink(args: string[]) {
  const prNumber = args[0];
  const action = args[1] || 'review';

  if (!prNumber) {
    console.error('Usage: orbit uplink <PR_NUMBER> [action]');
    return 1;
  }

  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  
  if (!config) {
      console.error(`❌ Settings not found for repo: ${repoName}. Run "orbit liftoff" first.`);
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

  console.log(`📡 Establishing uplink to remote mission PR #${prNumber} (${action})...`);

  // Check for active tmux sessions
  const tmuxRes = await provider.getExecOutput(`tmux list-sessions -F "#S" | grep "mission-${prNumber}-${action}"`, { wrapCapsule: containerName });
  if (tmuxRes.status === 0 && tmuxRes.stdout.trim()) {
      console.log(`🧵 Found active mission sessions:\n${tmuxRes.stdout.trim()}`);
  } else {
      console.log('❌ No active mission sessions detected in the remote capsule.');
  }

  // Look for any persistent log files in the satellite worktree
  const worktreePath = `${SATELLITE_WORKTREES_PATH}/${config.repoName}/mission-${prNumber}-${action}`;
  const logDir = `${worktreePath}/.gemini/logs`;
  
  const logRes = await provider.getExecOutput(`ls -t ${logDir}/*.log | head -n 1`, { wrapCapsule: containerName });
  if (logRes.status === 0 && logRes.stdout.trim()) {
      const latestLog = logRes.stdout.trim();
      console.log(`📄 Latest remote log: ${latestLog}`);
      console.log('\n--- LIVE REMOTE STREAM (Tip) ---');
      console.log(`Tip: To stream live output, run: orbit attach ${prNumber} ${action}`);
  } else {
      console.log('❌ No remote log files found in the satellite worktree.');
  }

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runUplink(process.argv.slice(2)).then(code => process.exit(code || 0)).catch(err => {
      console.error(err);
      process.exit(1);
  });
}

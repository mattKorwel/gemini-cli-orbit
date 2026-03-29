/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


import { ProviderFactory } from './providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import { 
  SATELLITE_WORKTREES_PATH, 
  DEFAULT_TEMP_DIR
} from './Constants.js';
import fs from 'node:fs';
import path from 'node:path';

export async function runLogs(args: string[]) {
  const prNumber = args[0];
  const action = args[1] || 'review';

  if (!prNumber) {
    console.error('Usage: orbit uplink <PR_NUMBER> [action]');
    return 1;
  }

  // 1. Check for LOCAL centralized mission logs first
  const localPattern = `orbit-${prNumber}-${action}-`;
  if (fs.existsSync(DEFAULT_TEMP_DIR)) {
      const localDirs = fs.readdirSync(DEFAULT_TEMP_DIR)
          .filter(d => d.startsWith(localPattern))
          .map(d => ({ name: d, time: fs.statSync(path.join(DEFAULT_TEMP_DIR, d)).mtime.getTime() }))
          .sort((a, b) => b.time - a.time);

      if (localDirs.length > 0) {
          const latestLocal = path.join(DEFAULT_TEMP_DIR, localDirs[0].name);
          console.log(`📂 Found local mission logs in: ${latestLocal}`);
          const logs = fs.readdirSync(latestLocal).filter(f => f.endsWith('.log'));
          if (logs.length > 0) {
              console.log('\n--- LIVE LOCAL LOGS (Tail) ---');
              // Just show the command for user to run tail -f
              console.log(`Tip: To stream live, run: tail -f ${latestLocal}/*.log`);
              return 0;
          }
      }
  }

  // 2. Fallback to REMOTE blackbox logs
  const repoName = detectRepoName();
...
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

  console.log(`📋 Checking blackbox status for mission PR #${prNumber} (${action})...`);

  // Check for active tmux sessions
  const tmuxRes = await provider.getExecOutput(`tmux list-sessions -F "#S" | grep "mission-${prNumber}-${action}"`, { wrapCapsule: containerName });
  if (tmuxRes.status === 0 && tmuxRes.stdout.trim()) {
      console.log(`🧵 Found active mission sessions:\n${tmuxRes.stdout.trim()}`);
  } else {
      console.log('❌ No active mission sessions found for this satellite.');
  }

  // Look for any persistent log files in the worktree
  const worktreePath = `${SATELLITE_WORKTREES_PATH}/${config.repoName}/mission-${prNumber}-${action}`;
  const logDir = `${worktreePath}/.gemini/logs`;
  
  const logRes = await provider.getExecOutput(`ls -t ${logDir}/*.log | head -n 1`, { wrapCapsule: containerName });
  if (logRes.status === 0 && logRes.stdout.trim()) {
      const latestLog = logRes.stdout.trim();
      console.log(`📄 Latest blackbox log file: ${latestLog}`);
      const catRes = await provider.getExecOutput(`tail -n 50 ${latestLog}`, { wrapCapsule: containerName });
      console.log('\n--- LAST 50 MISSION LOG LINES ---');
      console.log(catRes.stdout);
  } else {
      console.log('❌ No blackbox log files found in the satellite worktree.');
  }

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLogs(process.argv.slice(2)).then(code => process.exit(code || 0)).catch(err => {
      console.error(err);
      process.exit(1);
  });
}

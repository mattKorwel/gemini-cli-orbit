/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import { getRepoConfig, detectRepoName } from './ConfigManager.ts';
import { 
  WORKTREES_PATH, 
} from './Constants.ts';

const REPO_ROOT = process.cwd();

export async function runLogs(args: string[]) {
  const prNumber = args[0];
  const action = args[1] || 'open';

  if (!prNumber) {
    console.error('Usage: workspace logs <PR_NUMBER> [action]');
    return 1;
  }

  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  
  if (!config) {
      console.error(`❌ Settings not found for repo: ${repoName}. Run "workspace setup" first.`);
      return 1;
  }

  const { projectId, zone, dnsSuffix, userSuffix, backendType, instanceName } = config;
  const provider = ProviderFactory.getProvider({ 
      projectId, 
      zone, 
      instanceName,
      repoName,
      dnsSuffix,
      userSuffix,
      backendType
  });

  console.log(`📋 Checking remote status for job ${prNumber}-${action}...`);

  // Check for active tmux sessions
  const tmuxRes = await provider.getExecOutput(`tmux list-sessions -F "#S" | grep "workspace-${prNumber}-${action}"`, { wrapContainer: provider.workerName });
  if (tmuxRes.status === 0 && tmuxRes.stdout.trim()) {
      console.log(`🧵 Found active sessions:\n${tmuxRes.stdout.trim()}`);
      console.log(`\n💡 To attach, run: npx tsx scripts/attach.ts ${prNumber}`);
  } else {
      console.log('❌ No active tmux session found for this job.');
  }

  // Look for any persistent log files in the worktree
  const worktreePath = `${WORKTREES_PATH}/${config.repoName}/workspace-${prNumber}-${action}`;
  const logDir = `${worktreePath}/.gemini/logs`;
  
  const logRes = await provider.getExecOutput(`ls -t ${logDir}/*.log | head -n 1`, { wrapContainer: provider.workerName });
  if (logRes.status === 0 && logRes.stdout.trim()) {
      const latestLog = logRes.stdout.trim();
      console.log(`📄 Latest log file: ${latestLog}`);
      const catRes = await provider.getExecOutput(`tail -n 50 ${latestLog}`, { wrapContainer: provider.workerName });
      console.log('\n--- LAST 50 LINES ---');
      console.log(catRes.stdout);
  } else {
      console.log('❌ No log files found in the worktree.');
  }

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLogs(process.argv.slice(2)).then(code => process.exit(code || 0)).catch(err => {
      console.error(err);
      process.exit(1);
  });
}

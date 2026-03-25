/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import { 
  MAIN_REPO_PATH, 
  WORKTREES_PATH, 
  type WorkspaceConfig 
} from './Constants.ts';

const REPO_ROOT = process.cwd();

export async function runLogs(args: string[]) {
  const prNumber = args[0];
  const action = args[1] || 'open';

  if (!prNumber) {
    console.error('Usage: workspace logs <PR_NUMBER> [action]');
    return 1;
  }

  const settingsPath = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');
  if (!fs.existsSync(settingsPath)) {
      console.error('❌ Settings not found. Run "workspace setup" first.');
      return 1;
  }

  const settings: { workspace: WorkspaceConfig } = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.workspace;
  if (!config) {
      console.error('❌ Workspace configuration not found.');
      return 1;
  }

  const { projectId, zone } = config;
  const targetVM = `gcli-workspace-${process.env.USER || 'gcli-user'}`;
  const provider = ProviderFactory.getProvider({ projectId, zone, instanceName: targetVM });

  console.log(`📋 Checking remote status for job ${prNumber}-${action}...`);

  // Check for active tmux sessions
  const tmuxRes = await provider.getExecOutput(`tmux list-sessions -F "#S" | grep "workspace-${prNumber}-${action}"`, { wrapContainer: 'development-worker' });
  if (tmuxRes.status === 0 && tmuxRes.stdout.trim()) {
      console.log(`🧵 Found active sessions:\n${tmuxRes.stdout.trim()}`);
      console.log(`\n💡 To attach, run: npx tsx scripts/attach.ts ${prNumber}`);
  } else {
      console.log('❌ No active tmux session found for this job.');
  }

  // Look for any persistent log files in the worktree
  const worktreePath = `${WORKTREES_PATH}/workspace-${prNumber}-${action}`;
  const logDir = `${worktreePath}/.gemini/logs`;
  
  const logRes = await provider.getExecOutput(`ls -t ${logDir}/*.log | head -n 1`, { wrapContainer: 'development-worker' });
  if (logRes.status === 0 && logRes.stdout.trim()) {
      const latestLog = logRes.stdout.trim();
      console.log(`📄 Latest log file: ${latestLog}`);
      const catRes = await provider.getExecOutput(`tail -n 50 ${latestLog}`, { wrapContainer: 'development-worker' });
      console.log('\n--- LAST 50 LINES ---');
      console.log(catRes.stdout);
  } else {
      console.log('❌ No log files found in the worktree.');
  }

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLogs(process.argv.slice(2)).catch(console.error);
}

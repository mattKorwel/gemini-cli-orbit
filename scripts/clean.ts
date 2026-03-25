/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import fs from 'node:fs';

import readline from 'node:readline';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import { 
  WORKSPACES_ROOT, 
  MAIN_REPO_PATH, 
  WORKTREES_PATH, 
  CONFIG_DIR,
  type WorkspaceConfig 
} from './Constants.ts';


const REPO_ROOT = process.cwd();

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function runCleanup(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const prNumber = args[0];
  const action = args[1];

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
  const targetVM = `gcli-workspace-${env.USER || 'mattkorwel'}`;
  const provider = ProviderFactory.getProvider({
    projectId,
    zone,
    instanceName: targetVM,
  });

  if (prNumber && action) {
    const worktreePath = `${WORKTREES_PATH}/workspace-${prNumber}-${action}`;
    const containerName = `gcli-${prNumber}-${action}`;

    console.log(
      `🧹 Surgically removing session, container, and worktree for ${prNumber}-${action}...`,
    );

    // 1. Remove the specific container
    await provider.removeContainer(containerName);

    // 2. Remove specific worktree directory on host
    await provider.exec(`sudo rm -rf ${worktreePath}`);

    // 3. Clear history files for this PR and action on host
    await provider.exec(`sudo rm -rf ${CONFIG_DIR}/history/workspace-${prNumber}-${action}*`);

    console.log(`✅ Cleaned up ${prNumber}-${action}.`);
    return 0;
  }

  // --- Bulk Cleanup ---
  console.log(
    `⚠️  DANGER: You are about to perform a BULK cleanup on ${targetVM}.`,
  );
  const confirmed = await confirm(
    '   Are you sure you want to kill ALL sessions and worktrees?',
  );
  if (!confirmed) {
    console.log('❌ Cleanup cancelled.');
    return 0;
  }

  console.log(`🧹 Starting BULK cleanup...`);

  // 1. Standard Cleanup
  console.log('   - Killing ALL remote tmux sessions and containers...');
  const containerRes = await provider.getExecOutput("sudo docker ps -a --format '{{.Names}}' | grep '^gcli-'", { quiet: true });
  if (containerRes.status === 0 && containerRes.stdout.trim()) {
    const names = containerRes.stdout.trim().split('\n').join(' ');
    await provider.exec(`sudo docker rm -f ${names}`);
  }
  // Also remove the old global worker if it exists
  await provider.exec(`sudo docker rm -f maintainer-worker || true`);

  console.log('   - Cleaning up ALL Git Worktrees...');
  await provider.exec(`sudo rm -rf ${WORKTREES_PATH}/*`);

  console.log('   - Clearing Gemini session history and state...');
  await provider.exec(`sudo rm -rf ${CONFIG_DIR}/history/*`);
  await provider.exec(`sudo rm -f ${CONFIG_DIR}/state.json`);

  console.log('   - Wiping main repository clone...');
  await provider.exec(`sudo rm -rf ${MAIN_REPO_PATH}`);

  console.log('   - Cleaning up Docker resources...');
  await provider.exec(`sudo docker system prune -af --volumes`);

  console.log('✅ Remote environment cleared. You will need to run workspace setup again.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCleanup(process.argv.slice(2)).catch(console.error);
}

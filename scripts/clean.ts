/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import fs from 'node:fs';

import readline from 'node:readline';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import { getRepoConfig, detectRepoName } from './ConfigManager.ts';
import { 
  WORKSPACES_ROOT, 
  WORKTREES_PATH, 
  CONFIG_DIR,
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

  if (prNumber && action) {
    const repoWorktreesDir = `${WORKTREES_PATH}/${config.repoName}`;
    const worktreePath = `${repoWorktreesDir}/workspace-${prNumber}-${action}`;
    const containerName = `gcli-${prNumber}-${action}`;

    console.log(
      `🧹 Surgically removing session, container, and worktree for ${prNumber}-${action} in ${config.repoName}...`,
    );

    // 1. Remove the specific container
    const res1 = await provider.removeContainer(containerName);

    // 2. Remove specific worktree directory on host
    const res2 = await provider.exec(`sudo rm -rf ${worktreePath}`);

    // 3. Clear history files for this PR and action on host
    const res3 = await provider.exec(`sudo rm -rf ${CONFIG_DIR}/history/workspace-${prNumber}-${action}*`);

    if (res1 !== 0 || res2 !== 0 || res3 !== 0) {
        console.error('❌ Surgical cleanup failed.');
        return 1;
    }

    console.log(`✅ Cleaned up ${prNumber}-${action} in ${config.repoName}.`);
    return 0;
  }

  // --- Bulk Cleanup ---
  const isGlobal = args.includes('--all');
  console.log(
    `⚠️  DANGER: You are about to perform a ${isGlobal ? 'GLOBAL' : 'REPOSITORY'} cleanup on ${instanceName}.`,
  );
  const confirmed = await confirm(
    `   Are you sure you want to kill ALL sessions and worktrees for ${isGlobal ? 'THE ENTIRE WORKER' : config.repoName}?`,
  );
  if (!confirmed) {
    console.log('❌ Cleanup cancelled.');
    return 0;
  }

  console.log(`🧹 Starting ${isGlobal ? 'GLOBAL' : 'REPOSITORY'} cleanup...`);

  // 1. Standard Cleanup
  console.log('   - Killing remote containers...');
  const containerRes = await provider.getExecOutput("sudo docker ps -a --format '{{.Names}}' | grep '^gcli-'", { quiet: true });
  if (containerRes.status === 0 && containerRes.stdout.trim()) {
    const names = containerRes.stdout.trim().split('\n').join(' ');
    await provider.exec(`sudo docker rm -f ${names}`);
  }

  if (isGlobal) {
    console.log('   - Killing global supervisor container...');
    await provider.exec(`sudo docker rm -f development-worker || true`);
  }

  console.log(`   - Cleaning up Git Worktrees for ${isGlobal ? 'ALL repos' : config.repoName}...`);
  if (isGlobal) {
    await provider.exec(`sudo rm -rf ${WORKTREES_PATH}/*`);
  } else {
    await provider.exec(`sudo rm -rf ${WORKTREES_PATH}/${config.repoName}/*`);
  }

  console.log('   - Clearing Gemini session history and state...');
  await provider.exec(`sudo rm -rf ${CONFIG_DIR}/history/*`);
  await provider.exec(`sudo rm -f ${CONFIG_DIR}/state.json`);

  console.log(`   - Wiping ${isGlobal ? 'ALL' : 'current'} repository main clone...`);
  if (isGlobal) {
    await provider.exec(`sudo rm -rf ${WORKSPACES_ROOT}/main/*`);
  } else {
    await provider.exec(`sudo rm -rf ${config.remoteWorkDir}`);
  }

  console.log('   - Cleaning up Docker resources...');
  await provider.exec(`sudo docker system prune -af --volumes`);

  console.log(`✅ ${isGlobal ? 'Global worker' : 'Repository ' + config.repoName} cleared.`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCleanup(process.argv.slice(2)).then(code => process.exit(code || 0)).catch(err => {
      console.error(err);
      process.exit(1);
  });
}

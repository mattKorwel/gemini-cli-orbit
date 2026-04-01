/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderFactory } from './providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import { resolveMissionContext } from './utils/MissionUtils.js';
import { SATELLITE_WORKTREES_PATH, CONFIG_DIR } from './Constants.js';

export async function runJettison(args: string[]) {
  const prNumber = args[0];
  const actionArg = args[1] || 'mission';

  if (!prNumber) {
    console.error('❌ Usage: orbit jettison <IDENTIFIER> [action]');
    return 1;
  }

  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);

  if (!config) {
    console.error(`❌ Settings not found for repo: ${repoName}`);
    return 1;
  }

  const isLocal =
    !config.projectId ||
    config.projectId === 'local' ||
    (config.providerType as any) === 'local-worktree';

  const instanceName = config.instanceName || 'local';
  const provider = ProviderFactory.getProvider({
    ...config,
    projectId: config.projectId || 'local',
    zone: config.zone || 'local',
    instanceName,
  });

  console.log(`\n🛰️  Station: ${config.instanceName}`);
  console.log(
    `🧹 Surgically jettisoning capsule and worktree for #${prNumber} in ${repoName}...\n`,
  );

  const mCtx = resolveMissionContext(prNumber, actionArg);

  if (isLocal) {
    // For LocalWorktree, this removes the worktree and kills tmux session
    const res = await provider.removeCapsule(mCtx.branchName);
    if (res === 0) {
      console.log(
        `✅ Successfully jettisoned local workspace for ${mCtx.branchName}.`,
      );
    }
    return res;
  }

  // --- REMOTE ONLY LOGIC ---
  const containerName = mCtx.containerName;
  const repoWorktreesDir = `${SATELLITE_WORKTREES_PATH}/${config.repoName}`;
  const worktreePath = `${repoWorktreesDir}/${mCtx.worktreeName}`;

  // 1. Remove the specific container (capsule)
  await provider.removeCapsule(containerName);

  // 2. Remove specific worktree directory on host station
  await provider.exec(`sudo rm -rf ${worktreePath}`);

  // 3. Clear history files for this mission on host station
  await provider.exec(
    `sudo rm -rf ${CONFIG_DIR}/history/orbit-${mCtx.branchName}-${actionArg}*`,
  );

  console.log(
    `✅ Mission resources for ${mCtx.branchName} have been jettisoned.`,
  );
  return 0;
}

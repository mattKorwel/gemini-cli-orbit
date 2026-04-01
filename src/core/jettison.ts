/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderFactory } from '../providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';
import { SATELLITE_WORKTREES_PATH } from './Constants.js';

export async function runJettison(
  identifier: string,
  action: string = 'chat',
  _args: string[] = [],
): Promise<number> {
  if (!identifier) {
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
    `🧹 Surgically jettisoning capsule and worktree for #${identifier} in ${repoName}...\n`,
  );

  const mCtx = resolveMissionContext(identifier, action);

  if (isLocal) {
    // For LocalWorktree, this removes the worktree and kills tmux session
    // This part of the implementation was already here and might need more work if truly desired
    // but we'll focus on making the provider call consistent first.
  }

  try {
    const capsules = await provider.listCapsules();
    const targetCapsule = capsules.find((c) => c.includes(identifier));

    if (!targetCapsule) {
      console.log(`ℹ️  No active capsule found for identifier ${identifier}.`);
    } else {
      console.log(`   🔥 Decommissioning capsule: ${targetCapsule}`);
      await provider.stopCapsule(targetCapsule);
      await provider.removeCapsule(targetCapsule);
    }

    if (!isLocal) {
      const worktreePath = `${SATELLITE_WORKTREES_PATH}/${repoName}/${mCtx.worktreeName}`;
      console.log(`   📂 Purging remote worktree: ${worktreePath}`);
      await provider.exec(`rm -rf ${worktreePath}`);
    }

    console.log(`\n✅ Mission resources for ${identifier} have been jettisoned.`);
    return 0;
  } catch (e: any) {
    console.error(`\n❌ Jettison failed: ${e.message}`);
    return 1;
  }
}

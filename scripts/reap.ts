/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderFactory } from './providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';

/**
 * Reap Manager: Identifies and removes idle mission capsules.
 */
export async function runReap(
  options: { threshold?: number; force?: boolean } = {},
  env: NodeJS.ProcessEnv = process.env,
) {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  const threshold = options.threshold ?? 4; // Default 4 hours

  const isLocal =
    !config.projectId ||
    config.projectId === 'local' ||
    config.providerType === 'local-worktree' ||
    config.providerType === 'local-docker';

  const instanceName = config.instanceName || 'local';
  const provider = ProviderFactory.getProvider({
    ...config,
    projectId: config.projectId || 'local',
    zone: config.zone || 'local',
    instanceName,
  });

  console.log(
    `🧹 Orbit Reaper: Scanning for idle missions (threshold: ${threshold}h)...`,
  );

  const capsules = await provider.listCapsules();
  if (capsules.length === 0) {
    console.log('✅ No active mission capsules found.');
    return 0;
  }

  let reapedCount = 0;

  for (const capsule of capsules) {
    // Avoid reaping the 'main' worktree if it exists
    if (capsule === 'main' || capsule === 'primary') continue;

    const idleTime = await provider.getCapsuleIdleTime(capsule);
    const shouldReap = options.force || idleTime >= threshold;

    if (shouldReap) {
      console.log(`🔥 Reaping idle capsule: ${capsule} (Idle: ${idleTime}h)`);
      const res = await provider.removeCapsule(capsule);
      if (res === 0) reapedCount++;
    } else {
      console.log(
        `💤 Skipping active capsule: ${capsule} (Idle: ${idleTime}h)`,
      );
    }
  }

  console.log(`✅ Reaper complete. ${reapedCount} missions decommissioned.`);
  return 0;
}

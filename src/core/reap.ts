/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderFactory } from '../providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';

/**
 * Reap Manager: Identifies and removes idle mission capsules.
 */
export async function runReap(
  options: { threshold?: number; force?: boolean } = {},
) {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  const threshold = options.threshold ?? 4; // Default 4 hours

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

    const idleTimeSeconds = await provider.getCapsuleIdleTime(capsule);
    const idleTimeHours = Math.floor(idleTimeSeconds / 3600);
    const shouldReap = options.force || idleTimeHours >= threshold;

    if (shouldReap) {
      console.log(
        `🔥 Reaping idle capsule: ${capsule} (Idle: ${idleTimeHours}h)`,
      );
      const res = await provider.removeCapsule(capsule);
      if (res === 0) reapedCount++;
    } else {
      console.log(
        `💤 Skipping active capsule: ${capsule} (Idle: ${idleTimeHours}h)`,
      );
    }
  }

  console.log(`✅ Reaper complete. ${reapedCount} missions decommissioned.`);
  return 0;
}

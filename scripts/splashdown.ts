/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderFactory } from './providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';

/**
 * Splashdown: Emergency shutdown of all active capsules and/or stations.
 */
export async function runSplashdown(args: string[]) {
  const all = args.includes('--all');
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);

  const isLocal =
    !config.projectId ||
    config.projectId === 'local' ||
    (config.providerType as any) === 'local-worktree' ||
    (config.providerType as any) === 'local-worktree';

  const instanceName = config.instanceName || 'local';
  const provider = ProviderFactory.getProvider({
    ...config,
    projectId: config.projectId || 'local',
    zone: config.zone || 'local',
    instanceName,
  });

  console.log(`🌊 Orbit Splashdown: Decommissioning missions...`);

  const capsules = await provider.listCapsules();
  if (capsules.length === 0) {
    console.log('✅ No active mission capsules found.');
  } else {
    for (const capsule of capsules) {
      // Never wipe the 'main' folder locally
      if (isLocal && (capsule === 'main' || capsule === 'primary')) continue;

      console.log(`🔥 Jettisoning: ${capsule}...`);
      await provider.removeCapsule(capsule);
    }
    console.log('✅ All mission capsules decommissioned.');
  }

  if (all) {
    if (isLocal) {
      console.log('ℹ️ Station shutdown is a no-op in local mode.');
    } else {
      console.log(`🚀 Terminating Orbit Station: ${instanceName}...`);
      await provider.stop();
      console.log('✅ Station shutdown initiated.');
    }
  }

  return 0;
}

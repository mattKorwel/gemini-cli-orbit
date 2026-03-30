/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import { ProviderFactory } from './providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';

/**
 * Fleet Manager: Unified interface for managing remote GCE stations
 * and local workspace environments.
 */
export async function runFleet(args: string[]) {
  const action = args[0] || 'list';
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);

  const isLocal =
    !config.projectId ||
    config.projectId === 'local' ||
    config.providerType === 'local-worktree';

  const instanceName = config.instanceName || 'local';
  const provider = ProviderFactory.getProvider({
    ...config,
    projectId: config.projectId || 'local',
    zone: config.zone || 'local',
    instanceName,
  });

  if (action === 'list') {
    if (isLocal) {
      console.log(`🏠 Orbit Local Workspace (${repoName})`);
      console.log(`--------------------------------------------------`);
      const capsules = await provider.listCapsules();
      console.log(
        `📍 Path: ${config.worktreesDir || 'Standard sibling folder'}`,
      );
      console.log(
        `📦 Active worktrees: ${capsules.length ? capsules.join(', ') : 'None'}`,
      );
      console.log(`--------------------------------------------------`);
      return 0;
    }
    console.log(
      `🔍 Listing Orbit Stations for ${os.userInfo().username} in ${config.projectId}...`,
    );
    return provider.listStations();
  }

  if (
    action === 'provision' ||
    action === 'stop' ||
    action === 'destroy' ||
    action === 'rebuild'
  ) {
    if (isLocal) {
      console.log(`ℹ️ Action '${action}' is a no-op in local mode.`);
      return 0;
    }

    if (action === 'stop') {
      console.log(`🛑 Stopping Orbit Station: ${instanceName}...`);
      return provider.stop();
    }
    if (action === 'destroy') {
      console.log(`🔥 Destroying Orbit Station: ${instanceName}...`);
      return provider.destroy();
    }
    if (action === 'provision') {
      console.log(`🚀 Provisioning Orbit Station: ${instanceName}...`);
      return provider.provision({ setupNetwork: true });
    }
  }

  console.error(`❌ Unknown fleet action: ${action}`);
  return 1;
}

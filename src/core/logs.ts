/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderFactory } from '../providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';

/**
 * Retrieves logs for a specific mission capsule.
 */
export async function runLogs(
  identifier: string,
  action: string = 'review',
  _args: string[] = [],
): Promise<number> {
  if (!identifier) {
    console.error('❌ Usage: orbit uplink <IDENTIFIER> [action]');
    return 1;
  }

  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  const mCtx = resolveMissionContext(identifier, action);

  const provider = ProviderFactory.getProvider({
    ...config,
    projectId: config.projectId || 'local',
    zone: config.zone || 'local',
    instanceName: config.instanceName || 'local',
  } as any);

  const res = await provider.exec(`cat /tmp/orbit-mission-${mCtx.containerName}.log || echo "No logs found."`);
  return res;
}

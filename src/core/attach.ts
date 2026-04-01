/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderFactory } from '../providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import { SessionManager } from '../utils/SessionManager.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';

/**
 * Attaches to an active mission capsule.
 */
export async function runAttach(
  identifier: string,
  action: string = 'chat',
  _args: string[] = [],
): Promise<number> {
  if (!identifier) {
    console.error('❌ Usage: orbit attach <PR | BRANCH> [action]');
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

  console.log(`📡 Establishing mission uplink: ${mCtx.containerName}...`);

  const res = await provider.attach(mCtx.containerName);
  return res;
}

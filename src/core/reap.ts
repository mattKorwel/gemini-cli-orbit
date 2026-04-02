/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from './OrbitSDK.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';

/**
 * Legacy wrapper for reaper logic, now using OrbitSDK.
 */
export async function runReap(
  options: { threshold?: number; force?: boolean } = {},
): Promise<number> {
  try {
    const repoName = detectRepoName();
    const config = getRepoConfig(repoName);
    const sdk = new OrbitSDK(config);

    await sdk.reapMissions(options);
    return 0;
  } catch (e: any) {
    console.error(`❌ Reaper failed: ${e.message}`);
    return 1;
  }
}

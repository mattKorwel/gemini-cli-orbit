/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from './OrbitSDK.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';

import { type OrbitConfig } from './Constants.js';

/**
 * Legacy wrapper for reaper logic, now using OrbitSDK.
 */
export async function runReap(
  options: { threshold?: number; force?: boolean } = {},
  cliFlags: Partial<OrbitConfig> = {},
): Promise<number> {
  try {
    const repoRoot = process.cwd();
    const repoName = cliFlags.repoName || detectRepoName(repoRoot);
    const config = getRepoConfig(repoName, cliFlags, repoRoot);
    const sdk = new OrbitSDK(config, undefined, repoRoot);

    await sdk.reapMissions(options);
    return 0;
  } catch (e: any) {
    console.error(`❌ Reaper failed: ${e.message}`);
    return 1;
  }
}

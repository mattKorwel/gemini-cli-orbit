/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from '../sdk/OrbitSDK.js';
import { detectRepoName, getRepoConfig } from './ConfigManager.js';
import { type OrbitConfig } from './Constants.js';

/**
 * Legacy wrapper for CI logic, now using OrbitSDK.
 */
export async function runCI(
  args: string[] = [],
  cliFlags: Partial<OrbitConfig> = {},
): Promise<number> {
  const repoRoot = process.cwd();
  const repoName = cliFlags.repoName || detectRepoName(repoRoot);
  const config = getRepoConfig(repoName, cliFlags, repoRoot);
  const sdk = new OrbitSDK(config, undefined, repoRoot);

  const branch = args[0];
  const runId = args[1];

  const status = await sdk.monitorCI({ branch, runId });
  return status.status === 'FAILED' ? 1 : 0;
}

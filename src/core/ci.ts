/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from './OrbitSDK.js';
import { detectRepoName, getRepoConfig } from './ConfigManager.js';

/**
 * Legacy wrapper for CI logic, now using OrbitSDK.
 */
export async function runCI(args: string[] = []): Promise<number> {
  const repoRoot = process.cwd();
  const repoName = detectRepoName(repoRoot);
  const config = getRepoConfig(repoName, undefined, repoRoot);
  const sdk = new OrbitSDK(config, undefined, repoRoot);

  const branch = args[0];
  const runId = args[1];

  const status = await sdk.monitorCI({ branch, runId });
  return status.status === 'FAILED' ? 1 : 0;
}

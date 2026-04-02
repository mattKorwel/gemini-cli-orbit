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
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  const sdk = new OrbitSDK(config);

  const branch = args[0];
  const runId = args[1];

  const status = await sdk.monitorCI({ branch, runId });
  return status.status === 'FAILED' ? 1 : 0;
}

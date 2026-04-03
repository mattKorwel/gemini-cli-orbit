/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from './OrbitSDK.js';
import { detectRepoName, getRepoConfig } from './ConfigManager.js';

/**
 * Legacy wrapper for logs logic, now using OrbitSDK.
 */
export async function runLogs(
  identifier: string,
  action: string = 'review',
): Promise<number> {
  const repoRoot = process.cwd();
  const repoName = detectRepoName(repoRoot);
  const config = getRepoConfig(repoName, undefined, repoRoot);
  const sdk = new OrbitSDK(config, undefined, repoRoot);

  return sdk.getLogs({ identifier, action });
}

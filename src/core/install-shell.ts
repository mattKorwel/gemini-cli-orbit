/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from './OrbitSDK.js';
import { detectRepoName, getRepoConfig } from './ConfigManager.js';

/**
 * Legacy wrapper for install-shell logic, now using OrbitSDK.
 */
export async function runInstallShell(): Promise<number> {
  const repoRoot = process.cwd();
  const repoName = detectRepoName(repoRoot);
  const config = getRepoConfig(repoName, undefined, repoRoot);
  const sdk = new OrbitSDK(config, undefined, repoRoot);

  await sdk.installShell();
  return 0;
}

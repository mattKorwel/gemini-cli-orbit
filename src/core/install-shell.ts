/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from './OrbitSDK.js';
import { detectRepoName, getRepoConfig } from './ConfigManager.js';
import { type OrbitConfig } from './Constants.js';

/**
 * Legacy wrapper for install-shell logic, now using OrbitSDK.
 */
export async function runInstallShell(
  cliFlags: Partial<OrbitConfig> = {},
): Promise<number> {
  const repoRoot = process.cwd();
  const repoName = cliFlags.repoName || detectRepoName(repoRoot);
  const config = getRepoConfig(repoName, cliFlags, repoRoot);
  const sdk = new OrbitSDK(config, undefined, repoRoot);

  await sdk.installShell();
  return 0;
}

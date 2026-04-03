/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from '../sdk/OrbitSDK.js';
import { detectRepoName, getRepoConfig } from './ConfigManager.js';
import { type OrbitConfig } from './Constants.js';

/**
 * Legacy wrapper for attach logic, now using OrbitSDK.
 */
export async function runAttach(
  identifier: string,
  action: string = 'chat',
  _args: string[] = [],
  cliFlags: Partial<OrbitConfig> = {},
): Promise<number> {
  const repoRoot = process.cwd();
  const repoName = cliFlags.repoName || detectRepoName(repoRoot);
  const config = getRepoConfig(repoName, cliFlags, repoRoot);
  const sdk = new OrbitSDK(config, undefined, repoRoot);

  return sdk.attach({ identifier, action });
}

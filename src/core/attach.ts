/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from './OrbitSDK.js';
import { detectRepoName, getRepoConfig } from './ConfigManager.js';

/**
 * Legacy wrapper for attach logic, now using OrbitSDK.
 */
export async function runAttach(
  identifier: string,
  action: string = 'chat',
  _args: string[] = [],
): Promise<number> {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  const sdk = new OrbitSDK(config);

  return sdk.attach({ identifier, action });
}

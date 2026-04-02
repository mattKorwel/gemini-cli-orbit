/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from './OrbitSDK.js';
import { detectRepoName, getRepoConfig } from './ConfigManager.js';
import { type OrbitConfig } from './Constants.js';

/**
 * Legacy wrapper for setup logic, now using OrbitSDK.
 */
export async function runSetup(
  args: string[] = [],
  cliFlags: Partial<OrbitConfig> = {},
): Promise<number> {
  const schematicName = args[0] === 'liftoff' ? args[1] : args[0];
  const repoName = cliFlags.repoName || detectRepoName();
  const config = getRepoConfig(repoName, cliFlags);
  const sdk = new OrbitSDK(config);

  return sdk.provisionStation({
    schematicName,
    destroy: (cliFlags as any).destroy as boolean,
  });
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from './OrbitSDK.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import { type OrbitConfig } from './Constants.js';

/**
 * Legacy wrapper for jettison logic, now using OrbitSDK.
 */
export async function runJettison(
  identifier: string,
  action: string = 'chat',
  _args: string[] = [],
  cliFlags: Partial<OrbitConfig> = {},
): Promise<number> {
  try {
    const repoName = cliFlags.repoName || detectRepoName();
    const config = getRepoConfig(repoName, cliFlags);
    const sdk = new OrbitSDK(config);

    const result = await sdk.jettisonMission({
      identifier,
      action,
    });

    return result.exitCode;
  } catch (e: any) {
    console.error(`\n❌ Jettison failed: ${e.message}`);
    return 1;
  }
}

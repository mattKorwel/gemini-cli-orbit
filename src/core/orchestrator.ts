/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from './OrbitSDK.js';
import { getRepoConfig } from './ConfigManager.js';
import { type OrbitConfig } from './Constants.js';

/**
 * Legacy wrapper for orchestrator logic, now using OrbitSDK.
 */
export async function runOrchestrator(
  identifier: string,
  action: string,
  args: string[] = [],
  cliFlags: Partial<OrbitConfig> = {},
): Promise<number> {
  const repoName = cliFlags.repoName || args[0] || undefined;
  const config = getRepoConfig(repoName, cliFlags);
  const sdk = new OrbitSDK(config);

  const result = await sdk.startMission({
    identifier,
    action,
    args,
  });

  return result.exitCode;
}

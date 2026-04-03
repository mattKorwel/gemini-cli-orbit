/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from '../sdk/OrbitSDK.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
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
  const repoRoot = process.cwd();
  const repoName = cliFlags.repoName || args[0] || detectRepoName(repoRoot);
  const config = getRepoConfig(repoName, cliFlags, repoRoot);
  const sdk = new OrbitSDK(config, undefined, repoRoot);

  const result = await sdk.startMission({
    identifier,
    action,
    args,
  });

  return result.exitCode;
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from './OrbitSDK.js';
import { detectRepoName, getRepoConfig } from './ConfigManager.js';

/**
 * Legacy wrapper for splashdown logic, now using OrbitSDK.
 */
export async function runSplashdown(args: string[] = []): Promise<number> {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  const sdk = new OrbitSDK(config);

  return sdk.splashdown({
    all: args.includes('--all'),
  });
}

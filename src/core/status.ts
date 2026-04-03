/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from '../sdk/OrbitSDK.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import { type OrbitConfig } from './Constants.js';

/**
 * Legacy wrapper for status check, now using OrbitSDK.
 */
export async function runStatus(
  cliFlags: Partial<OrbitConfig> = {},
): Promise<number> {
  try {
    const repoRoot = process.cwd();
    const repoName = cliFlags.repoName || detectRepoName(repoRoot);
    const config = getRepoConfig(repoName, cliFlags, repoRoot);
    const sdk = new OrbitSDK(config, undefined, repoRoot);
    const pulse = await sdk.getPulse();

    console.log(`\n🛰️  ORBIT PULSE: ${pulse.stationName} (${pulse.repoName})`);
    console.log(
      `--------------------------------------------------------------------------------`,
    );
    console.log(`   - Station State:  ${pulse.status}`);
    if (pulse.internalIp)
      console.log(`   - Internal IP:    ${pulse.internalIp}`);
    if (pulse.externalIp)
      console.log(`   - External IP:    ${pulse.externalIp}`);
    console.log(`   - Station Name:   ${pulse.stationName}`);

    if (pulse.status === 'RUNNING') {
      console.log(`\n📦 ACTIVE MISSION CAPSULES:`);
      if (pulse.capsules.length > 0) {
        for (const c of pulse.capsules) {
          let label = '💤 [IDLE]    ';
          if (c.state === 'WAITING') label = '✋ [WAITING] ';
          if (c.state === 'THINKING') label = '🧠 [THINKING]';
          console.log(`     ${label} ${c.name.padEnd(20)} | ${c.stats}`);
        }
      } else {
        console.log('     - No mission capsules found');
      }
    }

    console.log(
      `--------------------------------------------------------------------------------\n`,
    );
    return 0;
  } catch (e: any) {
    console.error(`❌ ${e.message}`);
    return 1;
  }
}

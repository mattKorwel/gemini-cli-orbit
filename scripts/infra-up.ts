/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from '../src/sdk/OrbitSDK.js';
import { type OrbitContext } from '../src/core/Constants.js';

async function main() {
  const schematicName = process.argv[2];
  const instanceName = process.argv[3];

  if (!schematicName) {
    console.error(
      '❌ Usage: npm run infra:up <schematic-name> [instance-name]',
    );
    process.exit(1);
  }

  // 1. Mock Orbit Context for SDK initialization
  const context: OrbitContext = {
    project: {
      repoRoot: process.cwd(),
      repoName: 'orbit-infra-verify',
    },
    infra: {
      verbose: true,
    },
  } as any;

  // 2. Initialize SDK
  const sdk = new OrbitSDK(context);

  console.log(`🚀 Starfleet Liftoff: Provisioning '${schematicName}'...`);

  // 3. Perform Provisioning via SDK (includes integrated verification)
  const exitCode = await sdk.provisionStation({
    schematicName,
    stationName: instanceName,
  });

  if (exitCode === 0) {
    console.log('\n✅ Starfleet Ignition Successful.');
  } else {
    console.error('\n❌ Starfleet Ignition FAILED.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Fatal Error during SDK execution:');
  console.error(err);
  process.exit(1);
});

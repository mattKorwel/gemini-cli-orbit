/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GcpCosTarget } from '../src/infrastructure/targets/GcpCosTarget.js';
import { ConfigManager } from '../src/core/ConfigManager.js';
import { DependencyManager } from '../src/sdk/DependencyManager.js';
import { ProcessManager } from '../src/core/ProcessManager.js';
import path from 'node:path';
import { SCHEMATICS_DIR } from '../src/core/Constants.js';

async function main() {
  const schematicName = 'korwel-orbit-fresh';
  console.log(`🚀 Starfleet Ignition: Provisioning '${schematicName}'...`);

  // 1. Setup Environment
  const pm = new ProcessManager();
  const cm = new ConfigManager();

  // Ensure Pulumi is installed and initialized
  const dm = new DependencyManager(pm);
  await dm.ensurePulumi();

  // 2. Load Schematic
  const schematicPath = path.join(SCHEMATICS_DIR, `${schematicName}.json`);
  const config = cm.loadJson(schematicPath);

  if (!config) {
    throw new Error(`Schematic not found: ${schematicPath}`);
  }

  // Ensure verbose is on for testing
  config.verbose = true;

  // 3. Launch PNI
  const target = new GcpCosTarget(schematicName, config);

  console.log('🏗️  Starting Pulumi Provisioning...');
  const state = await target.up();

  if (state.status === 'ready') {
    console.log('\n✅ Infrastructure is READY.');
    console.log(`   Public IP:  ${state.publicIp || 'N/A'}`);
    console.log(`   Private IP: ${state.privateIp || 'N/A'}`);
  } else {
    console.error('\n❌ Infrastructure Provisioning FAILED.');
    console.error(state.error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Fatal Error during PNI execution:');
  console.error(err);
  process.exit(1);
});

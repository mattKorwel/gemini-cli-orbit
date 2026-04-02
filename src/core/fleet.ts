/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrbitSDK } from './OrbitSDK.js';
import { detectRepoName, getRepoConfig } from './ConfigManager.js';
import { type OrbitConfig } from './Constants.js';

/**
 * Fleet: Manage and coordinate Orbit stations.
 * Legacy wrapper now delegating to OrbitSDK where possible.
 */
export async function runFleet(
  args: string[],
  cliFlags: Partial<OrbitConfig> = {},
) {
  const repoName = cliFlags.repoName || detectRepoName();
  const config = getRepoConfig(repoName, cliFlags);
  const sdk = new OrbitSDK(config);

  const command = args[0]; // 'schematic' or 'station'
  const action = args[1];
  const name = args[2];

  // --- 📐 SCHEMATIC MANAGEMENT ---
  if (command === 'schematic') {
    if (action === 'list') {
      const schematics = sdk.listSchematics();
      console.log('\n📐 ORBIT INFRASTRUCTURE SCHEMATICS');
      console.log('--------------------------------------------------');
      if (schematics.length === 0) {
        console.log('   (No schematics found)');
      } else {
        schematics.forEach((s) => console.log(`   ${s}`));
      }
      console.log('--------------------------------------------------');
      console.log('Use "orbit schematic create <name>" to run wizard.\n');
      return 0;
    }

    if (action === 'create' || action === 'edit') {
      if (!name) {
        console.error('\n❌ Usage: orbit schematic <create|edit> <name>\n');
        return 1;
      }
      await sdk.runSchematicWizard(name, cliFlags);
      return 0;
    }

    if (action === 'import') {
      const source = name;
      if (!source) {
        console.error('\n❌ Usage: orbit schematic import <path|url>\n');
        return 1;
      }
      try {
        await sdk.importSchematic(source);
        return 0;
      } catch (_e: any) {
        console.error(`❌ Import failed: ${_e.message}`);
        return 1;
      }
    }
  }

  // --- 🛰️ STATION MANAGEMENT ---
  if (command === 'station') {
    if (action === 'activate') {
      if (!name) {
        console.error('\n❌ Usage: orbit station activate <name>\n');
        return 1;
      }
      await sdk.activateStation(name);
      return 0;
    }

    if (action === 'hibernate') {
      if (!name) {
        console.error('\n❌ Usage: orbit station hibernate <name>\n');
        return 1;
      }
      await sdk.hibernate({ name });
      return 0;
    }

    if (action === 'list') {
      const showMissions = args.includes('--missions') || args.includes('-m');
      const forceSync = args.includes('--sync') || args.includes('-s');

      const stations = await sdk.listStations({
        syncWithReality: forceSync,
        includeMissions: showMissions,
      });

      sdk.observer.onDivider?.('ORBIT CONSTELLATION');

      if (stations.length === 0) {
        console.log('✅ No provisioned stations found.');
        return 0;
      }

      stations.forEach((s) => {
        const typeIcon = s.type === 'gce' ? '☁️ ' : '🏠';
        const statusLabel = s.status ? `[${s.status}]` : '';
        console.log(
          `${s.isActive ? '➡️ ' : '  '} ${typeIcon} ${s.name.padEnd(30)} ${statusLabel.padEnd(12)} [${s.repo}]`,
        );

        if (showMissions) {
          if (s.missions.length > 0) {
            console.log('   📦 Active Missions:');
            s.missions.forEach((m) => console.log(`      • ${m}`));
          } else {
            console.log('   📦 Active Missions: None');
          }
        }

        if (s.type === 'gce') {
          console.log(`   - Project: ${s.projectId} | Zone: ${s.zone}`);
        } else {
          console.log(`   - Path: ${s.rootPath}`);
        }
        console.log(`   - Last Seen: ${s.lastSeen}\n`);
      });
      return 0;
    }

    if (action === 'liftoff') {
      return sdk.provisionStation({ schematicName: name });
    }

    if (action === 'delete') {
      // Direct legacy delete to new scoped splashdown
      await sdk.splashdown({ name });
      return 0;
    }
  }

  return 0;
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  loadSettings,
  saveSettings,
  getRepoConfig,
  detectRepoName,
} from './ConfigManager.js';
import { SchematicManager } from './SchematicManager.js';
import { logger } from './Logger.js';
import { ProviderFactory } from './providers/ProviderFactory.js';
import { runSetup } from './setup.js';
import { runSplashdown } from './splashdown.js';
import { StationManager } from './StationManager.js';

function divider(text: string) {
  const width = 80;
  const padding = Math.max(0, Math.floor((width - text.length - 2) / 2));
  console.log(
    `\n${'-'.repeat(padding)} ${text} ${'-'.repeat(width - padding - text.length - 2)}`,
  );
}

/**
 * Fleet: Manage and coordinate Orbit stations.
 */
export async function runFleet(args: string[]) {
  const repoName = detectRepoName();
  const settings = loadSettings();
  const schematicManager = new SchematicManager();
  const stationManager = new StationManager();

  const command = args[0]; // 'schematic' or 'station'
  const action = args[1];
  const name = args[2];

  // --- 📐 SCHEMATIC MANAGEMENT ---
  if (command === 'schematic') {
    if (action === 'list') {
      const schematics = schematicManager.listSchematics();
      console.log('\n📐 ORBIT INFRASTRUCTURE SCHEMATICS');
      console.log('--------------------------------------------------');
      if (schematics.length === 0) {
        console.log('   (No schematics found)');
      } else {
        schematics.forEach((s) => {
          console.log(`   ${s}`);
        });
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
      await schematicManager.runWizard(name);
      return 0;
    }

    if (action === 'import') {
      const source = name;
      if (!source) {
        console.error('\n❌ Usage: orbit schematic import <path|url>\n');
        return 1;
      }
      try {
        const importedName = await schematicManager.importSchematic(source);
        logger.info(
          'CONFIG',
          `✅ Imported schematic "${importedName}" successfully.`,
        );
        return 0;
      } catch (e: any) {
        console.error(`❌ Import failed: ${e.message}`, { cause: e });
        return 1;
      }
    }

    // Command-specific help for schematic
    if (
      !action ||
      action === 'help' ||
      action === '-h' ||
      action === '--help'
    ) {
      console.log(`
📐 ORBIT SCHEMATIC MANAGEMENT

Usage:
  orbit schematic list              List all blueprints.
  orbit schematic create <name>     Run interactive wizard.
  orbit schematic edit <name>       Modify existing blueprint.
  orbit schematic import <source>   Import from local file or URL.
    `);
      return 0;
    }
  }

  // --- 🛰️ STATION MANAGEMENT ---
  if (command === 'station') {
    // TARGET ACTIVATE
    if (action === 'activate') {
      if (!name) {
        console.error('\n❌ Usage: orbit station activate <name>\n');
        return 1;
      }

      const stations = await stationManager.listStations();
      const station = stations.find((s) => s.name === name);
      if (!station) {
        console.error(`❌ Station "${name}" not found in registry.`);
        return 1;
      }

      settings.activeStation = station.name;
      saveSettings(settings);
      logger.info('CONFIG', `🎯 Active Station set to: ${station.name}`);
      return 0;
    }

    // TARGET LIST
    if (action === 'list') {
      const showMissions = args.includes('--missions') || args.includes('-m');
      const forceSync = args.includes('--sync') || args.includes('-s');

      divider('ORBIT CONSTELLATION');
      const stations = await stationManager.listStations({
        syncWithReality: forceSync,
      });

      if (stations.length === 0) {
        console.log('✅ No provisioned stations found.');
        return 0;
      }

      const stationData = await Promise.all(
        stations.map(async (s) => {
          let missions: string[] = [];
          if (showMissions) {
            try {
              missions = await stationManager.getMissions(s);
            } catch (e) {}
          }
          return { ...s, missions };
        }),
      );

      stationData.forEach((s) => {
        const isActive = settings.activeStation === s.name;
        const typeIcon = s.type === 'gce' ? '☁️ ' : '🏠';
        console.log(
          `${isActive ? '➡️ ' : '  '} ${typeIcon} ${s.name.padEnd(30)} [${s.repo}]`,
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
        console.log(`   - Last Seen: ${s.lastSeen}`);
        console.log('');
      });
      return 0;
    }

    // TARGET LIFTOFF
    if (action === 'liftoff') {
      return runSetup(args.slice(1));
    }

    // TARGET DELETE
    if (action === 'delete') {
      const targetStation = name;
      if (targetStation) {
        const provider = ProviderFactory.getProvider({
          instanceName: targetStation,
          providerType: 'gce',
        } as any);
        await provider.destroy();
        stationManager.deleteReceipt(targetStation);
        if (settings.activeStation === targetStation)
          delete settings.activeStation;
        saveSettings(settings);
        return 0;
      }
      return runSplashdown(['--all']);
    }

    // Command-specific help for station
    if (
      !action ||
      action === 'help' ||
      action === '-h' ||
      action === '--help'
    ) {
      console.log(`
🛰️  ORBIT STATION MANAGEMENT

Usage:
  orbit station list                List all provisioned stations.
  orbit station activate <name>     Set the active target station.
  orbit station liftoff [schematic] Provision new infrastructure.
  orbit station delete [name]       Destroy a station (defaults to --all).
    `);
      return 0;
    }
  }

  // --- DEFAULT (HELP) ---
  console.log(`
🚀 ORBIT COMMAND CENTER

Usage:
  orbit schematic <list|create|edit|import>  Manage blueprints.
  orbit station <activate|list|liftoff|delete> Manage hardware.

EXAMPLES:
  orbit schematic create corp
  orbit station liftoff corp --setup-net
  orbit station activate station-supervisor
  `);

  return 0;
}

/**
 * Legacy support
 */
export async function runDesign(args: string[]) {
  return runFleet(['schematic', ...args]);
}

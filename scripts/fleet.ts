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

/**
 * Fleet: Manage and coordinate Orbit stations.
 */
export async function runFleet(args: string[]) {
  const repoName = detectRepoName();
  const settings = loadSettings();
  const manager = new SchematicManager();
  const stationManager = new StationManager();

  const subCommand = args[0]; // e.g., 'schematic', 'list', 'liftoff', 'delete', 'activate'
  const action = args[1]; // Action within subcommand

  // Flags
  const showMissions = args.includes('--missions') || args.includes('-m');
  const forceSync = args.includes('--sync') || args.includes('-s');

  // --- 📐 STATION SCHEMATIC ---
  if (subCommand === 'schematic') {
    const schematicAction = action || 'list';
    const name = args[2];

    if (schematicAction === 'list') {
      const schematics = manager.listSchematics();
      console.log('\n📐 ORBIT INFRASTRUCTURE SCHEMATICS');
      console.log('--------------------------------------------------');
      schematics.forEach((s) => {
        console.log(`   ${s}`);
      });
      console.log('--------------------------------------------------');
      console.log(
        'Use "orbit station schematic create <name>" to run wizard.\n',
      );
      return 0;
    }

    if (schematicAction === 'create' || schematicAction === 'edit') {
      if (!name) {
        console.error('❌ Please specify a schematic name.');
        return 1;
      }
      await manager.runWizard(name);
      return 0;
    }

    if (schematicAction === 'import') {
      const source = name;
      if (!source) {
        console.error('❌ Please specify a source (path or URL).');
        return 1;
      }
      try {
        const importedName = await manager.importSchematic(source);
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
  }

  // --- 🎯 STATION ACTIVATE ---
  if (subCommand === 'activate') {
    const target = action;
    if (!target) {
      console.error('❌ Please specify a station name to activate.');
      return 1;
    }

    const stations = await stationManager.listStations();
    const station = stations.find((s) => s.name === target);
    if (!station) {
      console.error(`❌ Station "${target}" not found in registry.`);
      return 1;
    }

    settings.activeStation = station.name;
    saveSettings(settings);
    logger.info('CONFIG', `🎯 Active Station set to: ${station.name}`);
    return 0;
  }

  // --- 📦 STATION LIST ---
  if (
    subCommand === 'list' ||
    subCommand === 'constellation' ||
    subCommand === 'fleet'
  ) {
    logger.divider('ORBIT CONSTELLATION');
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

  // --- 🚀 STATION LIFTOFF ---
  if (subCommand === 'liftoff') {
    return runSetup();
  }

  // --- 🔥 STATION DELETE ---
  if (subCommand === 'delete') {
    const targetStation = action; // orbit station delete <name>
    if (targetStation) {
      // targeted delete
      const provider = ProviderFactory.getProvider({
        instanceName: targetStation,
        providerType: 'gce', // assume GCE for remote delete
      } as any);
      await provider.destroy();
      stationManager.deleteReceipt(targetStation);
      if (settings.activeStation === targetStation)
        delete settings.activeStation;
      saveSettings(settings);
      return 0;
    }
    // default delete current
    return runSplashdown(['--all']);
  }

  // --- DEFAULT (HELP) ---
  console.log(`
🛰️  ORBIT STATION MANAGEMENT

Usage: orbit station <command> [args]

COMMANDS:
  schematic <list|create|edit|import> Manage infrastructure blueprints.
  activate  <name>                    Set the global active station.
  list      [--missions] [--sync]     Show provisioned stations.
  liftoff   [--setup-net]             Build infrastructure from blueprints.
  delete    [name]                    Decommission and remove station.
  `);

  return 0;
}

/**
 * Legacy support
 */
export async function runDesign(args: string[]) {
  return runFleet(['schematic', ...args]);
}

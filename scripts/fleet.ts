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
import { DesignManager } from './DesignManager.js';
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
  const config = getRepoConfig(repoName);
  const settings = loadSettings();
  const manager = new DesignManager();
  const stationManager = new StationManager();

  const subCommand = args[0]; // e.g., 'design', 'list', 'liftoff', 'delete'
  const action = args[1]; // Action within subcommand

  // Flags
  const showMissions = args.includes('--missions') || args.includes('-m');
  const forceSync = args.includes('--sync') || args.includes('-s');

  // --- 📐 STATION DESIGN ---
  if (subCommand === 'design') {
    const designAction = action || 'list';
    const name = args[2];

    if (designAction === 'list') {
      const designs = manager.listDesigns();
      console.log('\n📐 ORBIT INFRASTRUCTURE DESIGNS');
      console.log('--------------------------------------------------');
      designs.forEach((d) => {
        const isActive = d === settings.activeProfile;
        console.log(`${isActive ? '➡️ ' : '  '} ${d}`);
      });
      console.log('--------------------------------------------------');
      console.log('Use "orbit station design create <name>" to run wizard.');
      console.log(
        'Use "orbit station design switch <name>" to change active profile.\n',
      );
      return 0;
    }

    if (designAction === 'create' || designAction === 'edit') {
      if (!name) {
        console.error('❌ Please specify a design name.');
        return 1;
      }
      await manager.runWizard(name);
      return 0;
    }

    if (designAction === 'switch') {
      if (!name) {
        console.error('❌ Please specify a design name to switch to.');
        return 1;
      }
      settings.activeProfile = name;
      saveSettings(settings);
      logger.info('CONFIG', `✨ Switched active design to: ${name}`);
      return 0;
    }
  }

  // --- 📦 STATION LIST (FLEET) ---
  if (
    subCommand === 'list' ||
    subCommand === 'constellation' ||
    subCommand === 'fleet'
  ) {
    logger.divider('ORBIT CONSTELLATION');

    // Reality Sync is only performed if forced or for local stations (which is fast)
    const stations = await stationManager.listStations({
      syncWithReality: forceSync,
    });

    if (stations.length === 0) {
      console.log('✅ No provisioned stations found.');
      return 0;
    }

    // Process missions in parallel for speed if requested
    const stationData = await Promise.all(
      stations.map(async (s) => {
        let missions: string[] = [];
        if (showMissions) {
          try {
            missions = await stationManager.getMissions(s);
          } catch (e) {
            // Ignore mission fetch errors for individual stations
          }
        }
        return { ...s, missions };
      }),
    );

    stationData.forEach((s) => {
      const typeIcon = s.type === 'gce' ? '☁️ ' : '🏠';
      console.log(`${typeIcon} ${s.name.padEnd(30)} [${s.repo}]`);

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

    if (!showMissions) {
      console.log(
        '💡 Tip: Use "orbit station list --missions" to see active capsules.\n',
      );
    }
    return 0;
  }

  // --- 🚀 STATION LIFTOFF ---
  if (subCommand === 'liftoff') {
    return runSetup();
  }

  // --- 🔥 STATION DELETE ---
  if (subCommand === 'delete') {
    return runSplashdown(['--all']);
  }

  // --- 📥 STATION IMPORT ---
  if (subCommand === 'import') {
    const source = action;
    if (!source) {
      console.error('❌ Please specify a source (path or URL).');
      return 1;
    }
    try {
      const name = await manager.importDesign(source);
      logger.info('CONFIG', `✅ Imported design "${name}" successfully.`);
      return 0;
    } catch (e: any) {
      console.error(`❌ Import failed: ${e.message}`, { cause: e });
      return 1;
    }
  }

  // --- DEFAULT (HELP) ---
  console.log(`
🛰️  ORBIT STATION MANAGEMENT

Usage: orbit station <command> [args]

COMMANDS:
  design  <list|create|edit|switch>  Manage infrastructure blueprints.
  import  <path|url>                 Import a design from local file or URL.
  list    [--missions] [--sync]      Show provisioned stations (Synced).
  liftoff [--setup-net]              Build or wake the station for this repo.
  delete                             Decommission and remove the station.
  `);

  return 0;
}

/**
 * Legacy support
 */
export async function runDesign(args: string[]) {
  if (args[0] === 'station') {
    return runFleet(['design', ...args.slice(1)]);
  }
  return runFleet(['design', ...args]);
}

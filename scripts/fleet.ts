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

/**
 * Fleet: Manage and coordinate Orbit stations.
 */
export async function runFleet(args: string[]) {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  const settings = loadSettings();
  const manager = new DesignManager();

  const subCommand = args[0]; // e.g., 'design', 'list', 'liftoff', 'delete'
  const action = args[1]; // Action within subcommand

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
  if (subCommand === 'list' || subCommand === 'constellation') {
    const provider = ProviderFactory.getProvider(config as any);
    logger.divider('ORBIT CONSTELLATION');
    return provider.listStations();
  }

  // --- 🚀 STATION LIFTOFF ---
  if (subCommand === 'liftoff') {
    // Forward to setup script but with shifted args
    return runSetup();
  }

  // --- 🔥 STATION DELETE ---
  if (subCommand === 'delete') {
    // Forward to splashdown but specifically for the station
    return runSplashdown(['--all']);
  }

  // --- 📥 STATION IMPORT ---
  if (subCommand === 'import') {
    const source = action; // orbit station import <source>
    if (!source) {
      console.error('❌ Please specify a source (path or URL).');
      return 1;
    }
    try {
      const name = await manager.importDesign(source);
      logger.info('CONFIG', `✅ Imported design "${name}" successfully.`);
      return 0;
    } catch (e: any) {
      console.error(`❌ Import failed: ${e.message}`);
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
  list                               Show all provisioned stations in project.
  liftoff [--setup-net]              Build or wake the station for this repo.
  delete                             Decommission and remove the station.
  `);

  return 0;
}

/**
 * Legacy support for 'design' and 'fleet' entry points
 */
export async function runDesign(args: string[]) {
  // If called via 'orbit design station ...' we shift
  if (args[0] === 'station') {
    return runFleet(['design', ...args.slice(1)]);
  }
  return runFleet(['design', ...args]);
}

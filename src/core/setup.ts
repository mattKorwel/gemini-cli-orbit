/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderFactory } from '../providers/ProviderFactory.js';
import { InfrastructureFactory } from '../infrastructure/InfrastructureFactory.js';
import {
  getRepoConfig,
  detectRepoName,
  parseFlags,
  loadSettings,
  saveSettings,
  loadSchematic,
} from './ConfigManager.js';
import { logger } from './Logger.js';
import { StationManager } from './StationManager.js';

/**
 * Setup Orbit: Initial configuration and station provisioning.
 */
export async function runSetup(args: string[] = []) {
  const repoName = detectRepoName();
  const withStation = args.includes('--with-new-station');
  const destroy = args.includes('--destroy');
  const flags = parseFlags(args);

  // Filter out 'liftoff' if it's passed as the first argument from runFleet
  const filteredArgs = args[0] === 'liftoff' ? args.slice(1) : args;

  const schematicName =
    filteredArgs[0] && !filteredArgs[0].startsWith('--')
      ? filteredArgs[0]
      : flags.schematic || 'default';
  const schematic = loadSchematic(schematicName);

  logger.divider('ORBIT MISSION LIFTOFF');
  console.log(`📡 Schematic: ${schematicName}`);

  // 1. Resolve Config (CLI Flags > Schematic > Project Defaults)
  const config = { ...getRepoConfig(repoName), ...schematic, ...flags };
  const stationManager = new StationManager();

  if (!config.projectId && config.providerType !== 'local-worktree') {
    console.log('\n❌ No active infrastructure schematic found.');
    console.log(
      `👉 Please run "orbit schematic create ${schematicName}" to set up your blueprints.\n`,
    );
    return 1;
  }

  // 2. Infrastructure Layer (Declarative)
  const infraProvisioner = InfrastructureFactory.getProvisioner(schematicName, config as any);

  if (destroy) {
    logger.info('SETUP', `🔥 Decommissioning infrastructure for ${schematicName}...`);
    await infraProvisioner.down();
    logger.info('SETUP', '✅ Infrastructure destroyed.');
    return 0;
  }

  logger.divider('STATION LIFTOFF');
  logger.info(
    'SETUP',
    `Verifying infrastructure for ${config.instanceName || schematicName}...`,
  );

  // Bring up infrastructure
  const state = await infraProvisioner.up();

  if (state.status === 'error') {
    console.error(`\n❌ Infrastructure provisioning failed: ${state.error}`);
    return 1;
  }

  // 3. Execution Layer (Handover)
  const provider = ProviderFactory.getProvider(config as any, state);

  if (state.status === 'ready') {
    logger.info(
      'SETUP',
      `✅ Station is active at ${state.privateIp || state.publicIp || 'internal IP'}`,
    );
    await provider.ensureReady();
  }

  const isLocal =
    config.projectId === 'local' || config.providerType === 'local-worktree';

  // 4. Update Global Registry & Active Station
  if (state.status !== 'destroyed' && !isLocal) {
    const settings = loadSettings();
    const stationName = config.instanceName || schematicName;

    // Update global active station pointer
    settings.activeStation = stationName;
    saveSettings(settings);

    logger.info('SETUP', `🎯 Active Station set to: ${stationName}`);

    // 5. Save/Update Station Receipt
    stationManager.saveReceipt({
      name: stationName,
      instanceName: stationName,
      type: 'gce',
      projectId: config.projectId!,
      zone: config.zone || 'us-central1-a',
      repo: repoName,
      schematic: schematicName,
      lastSeen: new Date().toISOString(),
    });
  }

  logger.info('SETUP', '✨ Orbit is ready for mission deployment.');
  return 0;
}

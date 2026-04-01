/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderFactory } from '../providers/ProviderFactory.js';
import { InfrastructureFactory } from '../infrastructure/InfrastructureFactory.js';
import { DependencyManager } from './DependencyManager.js';
import {
  getRepoConfig,
  detectRepoName,
  loadSettings,
  saveSettings,
  loadSchematic,
} from './ConfigManager.js';
import { type OrbitConfig } from './Constants.js';
import { logger } from './Logger.js';
import { StationManager } from './StationManager.js';

/**
 * Setup Orbit: Initial configuration and station provisioning.
 */
export async function runSetup(
  args: string[] = [],
  cliFlags: Partial<OrbitConfig> = {},
) {
  const repoName = detectRepoName();
  const destroy = (cliFlags as any).destroy || args.includes('--destroy');

  // Filter out 'liftoff' if it's passed as the first argument from runFleet
  const filteredArgs = args[0] === 'liftoff' ? args.slice(1) : args;

  const schematicName =
    filteredArgs[0] && !filteredArgs[0].startsWith('--')
      ? filteredArgs[0]
      : cliFlags.schematic || process.env.GCLI_ORBIT_SCHEMATIC || 'default';
  const schematic = loadSchematic(schematicName);

  logger.divider('ORBIT MISSION LIFTOFF');
  console.log(`📡 Schematic: ${schematicName}`);

  // 1. Resolve Config (CLI Flags > Schematic > Project Defaults)
  const config = { ...getRepoConfig(repoName, cliFlags), ...schematic, ...cliFlags };
  const stationManager = new StationManager();

  if (!config.projectId && config.providerType !== 'local-worktree') {
    console.log('\n❌ No active infrastructure schematic found.');
    console.log(
      `👉 Please run "orbit schematic create ${schematicName}" to set up your blueprints.\n`,
    );
    return 1;
  }

  // 2. Dependency Check (Pulumi)
  if (config.providerType !== 'local-worktree') {
    await DependencyManager.ensurePulumi();
  }

  // 3. Infrastructure Layer (Declarative)
  const infraProvisioner = InfrastructureFactory.getProvisioner(
    schematicName,
    config as any,
  );

  if (destroy) {
    logger.info(
      'SETUP',
      `🔥 Decommissioning infrastructure for ${schematicName}...`,
    );
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
    logger.error('SETUP', `Infrastructure provisioning failed: ${state.error}`);
    return 1;
  }

  // 4. Execution Layer (Handover)
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

  // 5. Update Global Registry & Active Station
  if (state.status !== 'destroyed' && !isLocal) {
    const settings = loadSettings();
    const stationName = config.instanceName || schematicName;

    // Update global active station pointer
    settings.activeStation = stationName;
    saveSettings(settings);

    logger.info('SETUP', `🎯 Active Station set to: ${stationName}`);

    // 6. Save/Update Station Receipt
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

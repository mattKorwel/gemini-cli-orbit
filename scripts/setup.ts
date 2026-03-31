/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderFactory } from './providers/ProviderFactory.js';
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
export async function runSetup(
  args: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
) {
  const repoName = detectRepoName();
  const withStation = args.includes('--with-station');
  const setupNet = args.includes('--setup-net');
  const flags = parseFlags(args);

  const schematicName =
    args[0] && !args[0].startsWith('--')
      ? args[0]
      : flags.schematic || 'default';
  const schematic = loadSchematic(schematicName);

  logger.divider('ORBIT MISSION LIFTOFF');
  console.log(`📡 Schematic: ${schematicName}`);

  // 1. Resolve Config (CLI Flags > Schematic > Project Defaults)
  const config = { ...getRepoConfig(repoName), ...schematic, ...flags };
  const stationManager = new StationManager();

  if (!config.projectId) {
    console.log('\n❌ No active infrastructure schematic found.');
    console.log(
      `👉 Please run "orbit schematic create ${schematicName}" to set up your blueprints.\n`,
    );
    return 1;
  }

  // 2. Execution
  const provider = ProviderFactory.getProvider(config as any);
  logger.divider('STATION LIFTOFF');

  logger.info(
    'SETUP',
    `Verifying infrastructure for ${config.instanceName || 'station'}...`,
  );
  let status = await provider.getStatus();

  if (status.status === 'NOT_FOUND' || setupNet) {
    if (!setupNet && !withStation) {
      console.log(`\nℹ️  Station "${config.instanceName}" not found.`);
      console.log(
        '👉 To provision the full network and station, run: orbit station liftoff --setup-net --with-station\n',
      );
      return 1;
    }

    logger.info('SETUP', `Provisioning Orbit infrastructure...`);
    const code = await provider.provision({ setupNetwork: setupNet });
    if (code !== 0) return code;
    status = await provider.getStatus();
  }

  if (status.status === 'TERMINATED') {
    logger.info('SETUP', `Waking up station ${config.instanceName}...`);
    await provider.ensureReady();
  } else if (status.status === 'RUNNING') {
    logger.info(
      'SETUP',
      `✅ Station is already active at ${status.internalIp || 'internal IP'}`,
    );
    await provider.ensureReady(); // Fast-check supervisor
  }

  const isLocal =
    config.projectId === 'local' || config.providerType === 'local-worktree';

  // 3. Update Global Registry & Active Station
  if (status.status !== 'NOT_FOUND' && !isLocal) {
    const settings = loadSettings();
    const stationName = config.instanceName!;

    // Update global active station pointer
    settings.activeStation = stationName;
    saveSettings(settings);

    logger.info('SETUP', `🎯 Active Station set to: ${stationName}`);

    // 4. Save/Update Station Receipt
    stationManager.saveReceipt({
      name: stationName,
      type: 'gce',
      projectId: config.projectId!,
      zone: config.zone!,
      repo: repoName,
      schematic: schematicName,
      lastSeen: new Date().toISOString(),
    });
  }

  logger.info('SETUP', '✨ Orbit is ready for mission deployment.');
  return 0;
}

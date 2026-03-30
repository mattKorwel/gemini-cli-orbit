/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import { ProviderFactory } from './providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName, parseFlags } from './ConfigManager.js';
import { logger } from './Logger.js';
import { StationManager } from './StationManager.js';

/**
 * Setup Orbit: Initial configuration and station provisioning.
 */
export async function runSetup(env: NodeJS.ProcessEnv = process.env) {
  const args = process.argv.slice(2);
  const repoName = detectRepoName();
  const withStation = args.includes('--with-station');
  const setupNet = args.includes('--setup-net');
  const flags = parseFlags(args);

  logger.divider('ORBIT MISSION LIFTOFF');

  // 1. Resolve Config & Merge Flags
  const baseConfig = getRepoConfig(repoName);
  const config = { ...baseConfig, ...flags };
  const stationManager = new StationManager();

  if (!config.projectId) {
    console.log('\n❌ No active infrastructure design found.');
    console.log(
      '👉 Please run "orbit design station create default" to set up your blueprints.\n',
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
        '👉 To provision the full network and station, run: orbit liftoff --setup-net --with-station\n',
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

  // Save/Update Station Receipt
  if (status.status !== 'NOT_FOUND' && !isLocal) {
    stationManager.saveReceipt({
      name: config.instanceName || 'station-supervisor',
      type: 'gce',
      projectId: config.projectId!,
      zone: config.zone!,
      repo: repoName,
      ...(config.profile ? { design: config.profile } : {}),
      lastSeen: new Date().toISOString(),
    });
  }

  logger.info('SETUP', '✨ Orbit is ready for mission deployment.');
  return 0;
}

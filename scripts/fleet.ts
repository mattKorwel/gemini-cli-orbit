/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import fs from 'node:fs';

import { ProviderFactory } from './providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';

const REPO_ROOT = process.cwd();

const USER = process.env.USER || 'gcli-user';
const DEFAULT_ZONE = 'us-west1-a';

async function listStations(): Promise<number> {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  const projectId = config?.projectId || process.env.GOOGLE_CLOUD_PROJECT || '';

  if (!projectId) {
    console.error('❌ Project ID not found. Run "orbit liftoff" first.');
    return 1;
  }

  const instancePrefix = `gcli-station-${USER}`;
  console.log(`🔍 Listing Orbit Stations for ${USER} in ${projectId}...`);

  // We use a dummy provider just to trigger the listStations method which is static-ish in implementation
  const provider = ProviderFactory.getProvider({
    projectId: projectId!,
    zone: config?.zone || DEFAULT_ZONE,
    instanceName: instancePrefix,
    repoName,
  });

  return await provider.listStations();
}

async function launchStation(): Promise<number> {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);

  if (!config) {
    console.error(
      `❌ Settings not found for repo: ${repoName}. Run "orbit liftoff" first.`,
    );
    return 1;
  }

  const provider = ProviderFactory.getProvider({
    projectId: config.projectId!,
    zone: config.zone!,
    repoName: config.repoName,
    instanceName: config.instanceName!,
  });

  const status = await provider.getStatus();
  if (status.status !== 'UNKNOWN' && status.status !== 'ERROR') {
    console.log(
      `✅ Station ${config.instanceName} already exists and is ${status.status}.`,
    );
    return 0;
  }

  return await provider.provision();
}

async function stopStation(): Promise<number> {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  if (!config) return 1;

  const provider = ProviderFactory.getProvider({
    projectId: config.projectId!,
    zone: config.zone!,
    repoName: config.repoName,
    instanceName: config.instanceName!,
  });

  console.log(`🛑 Stopping orbit station: ${config.instanceName}...`);
  return await provider.stop();
}

async function destroyStation(): Promise<number> {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  if (!config) return 1;

  const provider = ProviderFactory.getProvider({
    projectId: config.projectId!,
    zone: config.zone!,
    repoName: config.repoName,
    instanceName: config.instanceName!,
  });

  const knownHostsPath = path.join(REPO_ROOT, '.gemini/orbit/known_hosts');
  if (fs.existsSync(knownHostsPath)) {
    console.log(`   - Clearing isolated known_hosts...`);
    fs.unlinkSync(knownHostsPath);
  }

  return await provider.destroy();
}

async function rebuildStation(): Promise<number> {
  const res1 = await destroyStation();
  const res2 = await launchStation();
  return res1 === 0 && res2 === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  const action = process.argv[2] || 'list';

  switch (action) {
    case 'list':
      return await listStations();
    case 'provision':
      return await launchStation();
    case 'rebuild':
      return await rebuildStation();
    case 'destroy':
      return await destroyStation();
    case 'stop':
      return await stopStation();
    default:
      console.error(`❌ Unknown constellation action: ${action}`);
      return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code || 0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

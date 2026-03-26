/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

import { ProviderFactory } from './providers/ProviderFactory.ts';
import { getRepoConfig, detectRepoName, loadSettings } from './ConfigManager.ts';


const REPO_ROOT = process.cwd();

const USER = process.env.USER || 'gcli-user';
const DEFAULT_ZONE = 'us-west1-a';

async function listWorkers(): Promise<number> {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  const projectId = config?.projectId || process.env.GOOGLE_CLOUD_PROJECT || '';

  if (!projectId) {
    console.error('❌ Project ID not found. Run "workspace setup" first.');
    return 1;
  }

  const instancePrefix = `gcli-workspace-${USER}`;
  console.log(`🔍 Listing Workspace Workers for ${USER} in ${projectId}...`);

  // We use a dummy provider just to trigger the listWorkers method which is static-ish in implementation
  const provider = ProviderFactory.getProvider({
    projectId: projectId,
    zone: config?.zone || DEFAULT_ZONE,
    instanceName: instancePrefix,
    repoName
  });

  return await provider.listWorkers();
}

async function provisionWorker(): Promise<number> {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  
  if (!config) {
    console.error(`❌ Settings not found for repo: ${repoName}. Run "workspace setup" first.`);
    return 1;
  }

  const provider = ProviderFactory.getProvider({
    projectId: config.projectId,
    zone: config.zone,
    repoName: config.repoName,
    instanceName: config.instanceName,
  });

  const status = await provider.getStatus();
  if (status.status !== 'UNKNOWN' && status.status !== 'ERROR') {
    console.log(
      `✅ Worker ${config.instanceName} already exists and is ${status.status}.`,
    );
    return 0;
  }

  return await provider.provision();
}

async function stopWorker(): Promise<number> {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  if (!config) return 1;

  const provider = ProviderFactory.getProvider({
    projectId: config.projectId,
    zone: config.zone,
    repoName: config.repoName,
    instanceName: config.instanceName,
  });

  console.log(`🛑 Stopping workspace worker: ${config.instanceName}...`);
  return await provider.stop();
}

async function destroyWorker(): Promise<number> {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  if (!config) return 1;
  
  const provider = ProviderFactory.getProvider({
    projectId: config.projectId,
    zone: config.zone,
    repoName: config.repoName,
    instanceName: config.instanceName,
  });

  const knownHostsPath = path.join(REPO_ROOT, '.gemini/workspaces/known_hosts');
  if (fs.existsSync(knownHostsPath)) {
    console.log(`   - Clearing isolated known_hosts...`);
    fs.unlinkSync(knownHostsPath);
  }

  return await provider.destroy();
}

async function rebuildWorker(): Promise<number> {
  const res1 = await destroyWorker();
  const res2 = await provisionWorker();
  return (res1 === 0 && res2 === 0) ? 0 : 1;
}

async function main(): Promise<number> {
  const action = process.argv[2] || 'list';

  switch (action) {
    case 'list':
      return await listWorkers();
    case 'provision':
      return await provisionWorker();
    case 'rebuild':
      return await rebuildWorker();
    case 'destroy':
      return await destroyWorker();
    case 'stop':
      return await stopWorker();
    default:
      console.error(`❌ Unknown fleet action: ${action}`);
      return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(code => process.exit(code || 0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

import { ProviderFactory } from './providers/ProviderFactory.ts';


const REPO_ROOT = process.cwd();

const USER = process.env.USER || 'gcli-user';
const INSTANCE_PREFIX = `gcli-workspace-${USER}`;
const DEFAULT_ZONE = 'us-west1-a';

function getProjectId(): string {
  const settingsPath = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return settings.workspace?.projectId;
    } catch {
      // Ignore
    }
  }
  return process.env.GOOGLE_CLOUD_PROJECT || '';
}

async function listWorkers(): Promise<number> {
  const projectId = getProjectId();
  if (!projectId) {
    console.error('❌ Project ID not found. Run "workspace setup" first.');
    return 1;
  }

  console.log(`🔍 Listing Workspace Workers for ${USER} in ${projectId}...`);

  const res = spawnSync(
    'gcloud',
    [
      'compute',
      'instances',
      'list',
      '--project',
      projectId,
      '--filter',
      `name~^${INSTANCE_PREFIX}`,
      '--format',
      'table(name,zone,status,networkInterfaces[0].networkIP:label=INTERNAL_IP,creationTimestamp)',
    ],
    { stdio: 'inherit' },
  );
  return res.status ?? 0;
}

async function provisionWorker(): Promise<number> {
  const projectId = getProjectId();
  if (!projectId) {
    console.error('❌ Project ID not found. Run "workspace setup" first.');
    return 1;
  }

  const provider = ProviderFactory.getProvider({
    projectId: projectId,
    zone: DEFAULT_ZONE,
    instanceName: INSTANCE_PREFIX,
  });

  const status = await provider.getStatus();
  if (status.status !== 'UNKNOWN' && status.status !== 'ERROR') {
    console.log(
      `✅ Worker ${INSTANCE_PREFIX} already exists and is ${status.status}.`,
    );
    return 0;
  }

  return await provider.provision();
}

async function stopWorker(): Promise<number> {
  const projectId = getProjectId();
  const provider = ProviderFactory.getProvider({
    projectId: projectId,
    zone: DEFAULT_ZONE,
    instanceName: INSTANCE_PREFIX,
  });

  console.log(`🛑 Stopping workspace worker: ${INSTANCE_PREFIX}...`);
  return await provider.stop();
}

function getZone(): string {
  const settingsPath = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return settings.workspace?.zone || DEFAULT_ZONE;
    } catch {
      // Ignore
    }
  }
  return DEFAULT_ZONE;
}

async function destroyWorker(): Promise<number> {
  const projectId = getProjectId();
  const zone = getZone();
  console.log(`🔥 DESTROYING worker ${INSTANCE_PREFIX} and its data disk...`);

  const knownHostsPath = path.join(REPO_ROOT, '.gemini/workspaces/known_hosts');
  if (fs.existsSync(knownHostsPath)) {
    console.log(`   - Clearing isolated known_hosts...`);
    fs.unlinkSync(knownHostsPath);
  }

  // Delete instance
  const res1 = spawnSync(
    'gcloud',
    [
      'compute',
      'instances',
      'delete',
      INSTANCE_PREFIX,
      '--project',
      projectId,
      '--zone',
      zone,
      '--quiet',
    ],
    { stdio: 'inherit' },
  );

  // Delete static IP if it exists
  const res2 = spawnSync(
    'gcloud',
    [
      'compute',
      'addresses',
      'delete',
      `${INSTANCE_PREFIX}-ip`,
      '--project',
      projectId,
      '--region',
      zone.split('-').slice(0, 2).join('-'),
      '--quiet',
    ],
    { stdio: 'pipe' },
  );
  return (res1.status === 0 && res2.status === 0) ? 0 : 1;
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

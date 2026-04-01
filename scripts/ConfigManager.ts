/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  type OrbitConfig,
  type OrbitSettings,
  DEFAULT_REPO_NAME,
  GLOBAL_SETTINGS_PATH,
  PROJECT_CONFIG_PATH,
  SCHEMATICS_DIR,
  STATIONS_DIR,
  GLOBAL_ORBIT_DIR,
} from './Constants.js';

/**
 * Resolves the final Orbit configuration for a repository.
 * Tiered Resolution: CLI Flags (--for-station) > Env Vars > Global activeStation > Dynamic Default
 */
export function getRepoConfig(repoName?: string): OrbitConfig {
  const rName = repoName || detectRepoName();
  const settings = loadSettings();
  const projectConfig = loadProjectConfig();

  // 1. Start with Project Defaults
  let config: OrbitConfig = { ...projectConfig, repoName: rName };

  // 2. Global Registry (User override for this specific repo)
  if (settings.repos[rName]) {
    config = { ...config, ...settings.repos[rName] };
  }

  // 3. Determine target station
  const flags = parseFlags(process.argv.slice(2));
  const targetStation =
    flags.forStation ||
    process.env.GCLI_ORBIT_INSTANCE_NAME ||
    settings.activeStation;

  // 4. Resolve Station details from Registry if targeted
  if (targetStation) {
    const receiptPath = path.join(STATIONS_DIR, `${targetStation}.json`);
    const receipt = loadJson(receiptPath);
    if (receipt) {
      config.stationName = receipt.name;
      config.instanceName = receipt.instanceName || receipt.name;
      config.projectId = receipt.projectId;
      config.zone = receipt.zone;
      config.providerType = receipt.type;

      // Merge in the schematic used to build this station if it exists
      if (receipt.schematic) {
        const schematic = loadSchematic(receipt.schematic);
        config = { ...config, ...schematic };
      }
    } else {
      // If station not in registry, assume name is literal
      config.stationName = targetStation;
      config.instanceName = targetStation;
    }
  }

  // 4. Global Overrides
  if (settings.tempDir) config.tempDir = settings.tempDir;
  if (settings.autoClean !== undefined) config.autoClean = settings.autoClean;

  // 5. Environment Overrides
  config = {
    ...config,
    projectId: process.env.GCLI_ORBIT_PROJECT_ID || config.projectId,
    zone: process.env.GCLI_ORBIT_ZONE || config.zone,
    instanceName: process.env.GCLI_ORBIT_INSTANCE_NAME || config.instanceName,
    backendType: (process.env.GCLI_ORBIT_BACKEND as any) || config.backendType,
    imageUri: process.env.GCLI_ORBIT_IMAGE || config.imageUri,
    providerType:
      (process.env.GCLI_ORBIT_PROVIDER as any) || config.providerType,
  };

  // 6. Merge final CLI Flags
  config = { ...config, ...flags };

  // 7. Dynamic Defaults (Final Fallback)
  if (!config.stationName) config.stationName = rName;
  if (!config.instanceName && config.projectId !== 'local') {
    config.instanceName = `gcli-station-${rName}`;
  }
  if (!config.remoteWorkDir) config.remoteWorkDir = '/mnt/disks/data/main';
  if (!config.worktreesDir) config.worktreesDir = '/mnt/disks/data/worktrees';

  return config;
}

export function detectRepoName(): string {
  if (process.env.GCLI_ORBIT_REPO_NAME) return process.env.GCLI_ORBIT_REPO_NAME;

  try {
    // 1. Try to get the repo name from the remote URL (most accurate)
    const remoteRes = spawnSync('git', ['remote', 'get-url', 'origin'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (remoteRes.status === 0 && remoteRes.stdout.trim()) {
      const url = remoteRes.stdout.trim();
      // Matches both https and git@ styles, extracting the name before .git
      const match = url.match(/\/([^\/]+)\.git$/);
      if (match && match[1]) return match[1];
    }

    // 2. Fallback to the basename of the git root
    const rootRes = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (rootRes.status === 0 && rootRes.stdout.trim()) {
      return path.basename(rootRes.stdout.trim());
    }
  } catch (_e) {}

  return DEFAULT_REPO_NAME;
}

export function loadSettings(): OrbitSettings {
  const defaultSettings: OrbitSettings = { repos: {} };
  if (!fs.existsSync(GLOBAL_SETTINGS_PATH)) return defaultSettings;
  try {
    return JSON.parse(fs.readFileSync(GLOBAL_SETTINGS_PATH, 'utf8'));
  } catch (_e) {
    return defaultSettings;
  }
}

export function saveSettings(settings: OrbitSettings): void {
  if (!fs.existsSync(GLOBAL_ORBIT_DIR)) {
    fs.mkdirSync(GLOBAL_ORBIT_DIR, { recursive: true });
  }
  fs.writeFileSync(GLOBAL_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

export function loadProjectConfig(): Partial<OrbitConfig> {
  if (!fs.existsSync(PROJECT_CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(PROJECT_CONFIG_PATH, 'utf8'));
  } catch (_e) {
    return {};
  }
}

export function loadSchematic(name: string): Partial<OrbitConfig> {
  const p = path.join(SCHEMATICS_DIR, `${sanitizeName(name)}.json`);
  return loadJson(p) || {};
}

export function saveSchematic(name: string, config: any): void {
  if (!fs.existsSync(SCHEMATICS_DIR)) {
    fs.mkdirSync(SCHEMATICS_DIR, { recursive: true });
  }
  const p = path.join(SCHEMATICS_DIR, `${sanitizeName(name)}.json`);
  fs.writeFileSync(p, JSON.stringify(config, null, 2));
}

export function loadJson(p: string): any {
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_e) {}
  }
  return null;
}

/**
 * Central Registry of supported configuration flags.
 */
export const ACCEPTED_FLAGS = [
  { flag: 'projectId', desc: 'Google Cloud Project ID' },
  { flag: 'zone', desc: 'Google Compute Engine Zone' },
  { flag: 'instanceName', desc: 'Station VM Name' },
  {
    flag: 'backend',
    target: 'backendType',
    desc: 'Networking backend (direct-internal | external)',
  },
  { flag: 'dnsSuffix', desc: 'Custom DNS zone suffix' },
  { flag: 'userSuffix', desc: 'OS Login username suffix' },
  { flag: 'vpcName', desc: 'VPC network name' },
  { flag: 'subnetName', desc: 'Subnet name' },
  { flag: 'machineType', desc: 'GCE machine type' },
  { flag: 'image', target: 'imageUri', desc: 'Container image URI' },
  { flag: 'schematic', desc: 'Infrastructure blueprint name' },
  {
    flag: 'for-station',
    target: 'forStation',
    desc: 'Target a specific station',
  },
];

export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase();
}

export function parseFlags(args: string[]): Partial<OrbitConfig> {
  const config: any = {};

  for (const arg of args) {
    if (!arg || !arg.startsWith('--')) continue;

    const [rawKey, val] = arg.slice(2).split('=');
    if (!rawKey || val === undefined) continue;

    const match = ACCEPTED_FLAGS.find((f) => f.flag === rawKey);
    if (match) {
      const targetKey = match.target || match.flag;
      config[targetKey] = val;
    }
  }

  return config;
}

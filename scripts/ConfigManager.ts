/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  type OrbitConfig,
  type OrbitSettings,
  DEFAULT_REPO_NAME,
  DEFAULT_TEMP_DIR,
  GLOBAL_SETTINGS_PATH,
  PROJECT_CONFIG_PATH,
  PROJECT_ORBIT_DIR,
  SCHEMATICS_DIR,
  STATIONS_DIR,
  GLOBAL_ORBIT_DIR,
} from './Constants.js';

const REPO_ROOT = process.cwd();

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

  // 2. Determine target station
  const flags = parseFlags(process.argv.slice(2));
  const targetStation =
    flags.forStation ||
    process.env.GCLI_ORBIT_INSTANCE_NAME ||
    settings.activeStation;

  // 3. Resolve Station details from Registry if targeted
  if (targetStation) {
    const receiptPath = path.join(STATIONS_DIR, `${targetStation}.json`);
    const receipt = loadJson(receiptPath);
    if (receipt) {
      config.instanceName = receipt.name;
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
    const res = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      stdio: 'pipe',
    });
    if (res.status === 0) {
      return path.basename(res.stdout.toString().trim());
    }
  } catch (e) {}

  return DEFAULT_REPO_NAME;
}

export function loadSettings(): OrbitSettings {
  const defaultSettings: OrbitSettings = { repos: {} };
  if (!fs.existsSync(GLOBAL_SETTINGS_PATH)) return defaultSettings;
  try {
    return JSON.parse(fs.readFileSync(GLOBAL_SETTINGS_PATH, 'utf8'));
  } catch (e) {
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
  } catch (e) {
    return {};
  }
}

export function loadSchematic(name: string): Partial<OrbitConfig> {
  const p = path.join(SCHEMATICS_DIR, `${name}.json`);
  return loadJson(p) || {};
}

export function saveSchematic(name: string, config: any): void {
  if (!fs.existsSync(SCHEMATICS_DIR)) {
    fs.mkdirSync(SCHEMATICS_DIR, { recursive: true });
  }
  const p = path.join(SCHEMATICS_DIR, `${name}.json`);
  fs.writeFileSync(p, JSON.stringify(config, null, 2));
}

export function loadJson(p: string): any {
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {}
  }
  return null;
}

export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase();
}

export function parseFlags(args: string[]): Partial<OrbitConfig> {
  const config: any = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg.startsWith('--projectId=')) config.projectId = arg.split('=')[1];
    if (arg.startsWith('--zone=')) config.zone = arg.split('=')[1];
    if (arg.startsWith('--instanceName='))
      config.instanceName = arg.split('=')[1];
    if (arg.startsWith('--backend=')) config.backendType = arg.split('=')[1];
    if (arg.startsWith('--dnsSuffix=')) config.dnsSuffix = arg.split('=')[1];
    if (arg.startsWith('--userSuffix=')) config.userSuffix = arg.split('=')[1];
    if (arg.startsWith('--vpcName=')) config.vpcName = arg.split('=')[1];
    if (arg.startsWith('--subnetName=')) config.subnetName = arg.split('=')[1];
    if (arg.startsWith('--machineType='))
      config.machineType = arg.split('=')[1];
    if (arg.startsWith('--image=')) config.imageUri = arg.split('=')[1];
    if (arg.startsWith('--profile=')) config.schematic = arg.split('=')[1];
    if (arg.startsWith('--schematic=')) config.schematic = arg.split('=')[1];
    if (arg.startsWith('--for-station=')) config.forStation = arg.split('=')[1];
  }
  return config;
}

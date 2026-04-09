/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  type OrbitConfig,
  type OrbitSettings,
  type ProjectContext,
  type InfrastructureSpec,
  DEFAULT_REPO_NAME,
  GLOBAL_SETTINGS_PATH,
  getProjectConfigPath,
  SCHEMATICS_DIR,
  STATIONS_DIR,
  GLOBAL_ORBIT_DIR,
  DEFAULT_VPC_NAME,
  DEFAULT_SUBNET_NAME,
} from './Constants.js';

import { type IConfigManager, type IProcessManager } from './interfaces.js';
import { ProcessManager } from './ProcessManager.js';

export class ConfigManager implements IConfigManager {
  loadSettings(): OrbitSettings {
    return loadSettings();
  }
  saveSettings(settings: OrbitSettings): void {
    saveSettings(settings);
  }
  loadSchematic(name: string): Partial<OrbitConfig> {
    return loadSchematic(name);
  }
  saveSchematic(name: string, config: any): void {
    saveSchematic(name, config);
  }
  loadJson(path: string): any {
    return loadJson(path);
  }
  detectRemoteUrl(repoRoot: string): string | null {
    return detectRemoteUrl(repoRoot);
  }
}

/**
 * Resolves the final Orbit configuration for a repository.
 * Tiered Resolution: CLI Flags (--for-station) > Env Vars > Global activeStation > Project Defaults
 */
export function getRepoConfig(
  repoName?: string,
  cliFlags: Partial<OrbitConfig> = {},
  repoRoot: string = process.cwd(),
  options: { ignoreGlobalState?: boolean } = {},
): OrbitConfig {
  const rName = repoName || cliFlags.repoName || detectRepoName(repoRoot);
  const settings = options.ignoreGlobalState
    ? ({ repos: {} } as any)
    : loadSettings();
  const projectConfig = loadProjectConfig(repoRoot);

  // 1. Start with Project Defaults
  let config: OrbitConfig = { ...projectConfig, repoName: rName };

  // 2. Global Registry (User override for this specific repo)
  if (!options.ignoreGlobalState && settings.repos[rName]) {
    config = { ...config, ...settings.repos[rName] };
  }

  // 3. Determine target station
  const targetStation =
    (cliFlags as any).forStation ||
    process.env.GCLI_ORBIT_INSTANCE_NAME ||
    (options.ignoreGlobalState
      ? undefined
      : settings.repos[rName]?.activeStation || settings.activeStation);

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

      const actualInstanceName = receipt.instanceName || receipt.name;

      // Merge in the schematic used to build this station if it exists
      if (receipt.schematic) {
        const schematic = loadSchematic(receipt.schematic);
        config = { ...config, ...schematic };
      }

      // Restore the actual instance name if the schematic tried to override it
      config.instanceName = actualInstanceName;
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
  const envConfig: Partial<OrbitConfig> = {
    projectId: process.env.GCLI_ORBIT_PROJECT_ID || config.projectId,
    zone: process.env.GCLI_ORBIT_ZONE || config.zone,
    instanceName: process.env.GCLI_ORBIT_INSTANCE_NAME || config.instanceName,
    networkAccessType:
      (process.env.GCLI_ORBIT_BACKEND as any) || config.networkAccessType,
    imageUri: process.env.GCLI_ORBIT_IMAGE || config.imageUri,
    providerType:
      (process.env.GCLI_ORBIT_PROVIDER as any) || config.providerType,
    verbose:
      process.env.GCLI_ORBIT_VERBOSE !== undefined
        ? process.env.GCLI_ORBIT_VERBOSE === '1'
        : config.verbose,
  };

  config = {
    ...config,
    ...envConfig,
  };

  // 6. Merge final CLI Flags
  config = { ...config, ...cliFlags };

  // 7. Dynamic Defaults (Final Fallback)
  if (!config.stationName) config.stationName = rName;
  if (!config.instanceName && config.projectId !== 'local') {
    const user = (process.env.USER || process.env.USERNAME || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    config.instanceName = `station-${user}-${rName}`;
  }
  if (!config.remoteWorkDir) config.remoteWorkDir = '/mnt/disks/data/main';

  // Logic Fix: NO more global workspacesDir default here.
  // Let the concrete Provider handle its own environment-specific defaults.
  if (!config.workspacesDir) {
    config.workspacesDir = config.worktreesDir;
  }
  if (!config.worktreesDir) config.worktreesDir = config.workspacesDir;

  if (config.manageNetworking === undefined) {
    config.manageNetworking = true;
  }

  if (!config.vpcName) {
    config.vpcName = config.manageNetworking ? DEFAULT_VPC_NAME : 'default';
  }
  if (!config.subnetName) {
    config.subnetName = config.manageNetworking
      ? DEFAULT_SUBNET_NAME
      : 'default';
  }

  return config;
}

/**
 * Resolves the functional data bundles from a raw config.
 */
export function resolveContextBundles(
  repoRoot: string,
  config: OrbitConfig,
): {
  project: ProjectContext;
  infra: InfrastructureSpec;
} {
  return {
    project: {
      repoRoot,
      repoName: config.repoName || detectRepoName(repoRoot),
    },
    infra: {
      projectId: config.projectId,
      zone: config.zone,
      instanceName: config.instanceName,
      stationName: config.stationName,
      providerType: config.providerType,
      networkAccessType: config.networkAccessType,
      imageUri: config.imageUri,
      upstreamRepo: config.upstreamRepo,
      manageNetworking: config.manageNetworking,
      vpcName: config.vpcName,
      subnetName: config.subnetName,
      machineType: config.machineType,
      sshSourceRanges: config.sshSourceRanges,
      workspacesDir: config.workspacesDir,
      worktreesDir: config.worktreesDir,
      remoteWorkDir: config.remoteWorkDir,
      useTmux: config.useTmux,
      cpuLimit: config.cpuLimit,
      memoryLimit: config.memoryLimit,
      reaperIdleLimit: config.reaperIdleLimit,
      dnsSuffix: config.dnsSuffix,
      userSuffix: config.userSuffix,
    },
  };
}

export function detectRepoName(
  repoRoot: string = process.cwd(),
  options: { silent?: boolean; pm?: IProcessManager } = {},
): string {
  if (process.env.GCLI_ORBIT_REPO_NAME) return process.env.GCLI_ORBIT_REPO_NAME;

  const pm = options.pm || new ProcessManager();

  try {
    // 1. Try to get the repo name from the remote URL (most accurate)
    const remoteRes = pm.runSync('git', ['remote', 'get-url', 'origin'], {
      quiet: true,
      cwd: repoRoot,
    });
    if (remoteRes.status === 0 && remoteRes.stdout.trim()) {
      const url = remoteRes.stdout.trim();
      const match = url.match(/\/([^\/]+)\.git$/);
      if (match && match[1]) return match[1];
    }

    // 2. Fallback to the basename of the git root
    const rootRes = pm.runSync('git', ['rev-parse', '--show-toplevel'], {
      quiet: true,
      cwd: repoRoot,
    });
    if (rootRes.status === 0 && rootRes.stdout.trim()) {
      return path.basename(rootRes.stdout.trim());
    }
  } catch (_e) {}

  return DEFAULT_REPO_NAME;
}

export function detectRemoteUrl(
  repoRoot: string = process.cwd(),
  pm: IProcessManager = new ProcessManager(),
): string {
  try {
    const remoteRes = pm.runSync('git', ['remote', 'get-url', 'origin'], {
      quiet: true,
      cwd: repoRoot,
    });
    if (remoteRes.status === 0 && remoteRes.stdout.trim()) {
      return remoteRes.stdout.trim();
    }
  } catch (_e) {}
  return '';
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

export function loadProjectConfig(
  repoRoot: string = process.cwd(),
): Partial<OrbitConfig> {
  const p = getProjectConfigPath(repoRoot);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
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

export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase();
}

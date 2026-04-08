/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const getFilename = () => {
  try {
    return fileURLToPath(import.meta.url);
  } catch {
    return __filename;
  }
};

const getDirname = () => {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return __dirname;
  }
};

const _filename = getFilename();
const _dirname = getDirname();

// This is the root of the Gemini Orbit extension code (the folder containing package.json)
let EXTENSION_ROOT = path.resolve(_dirname, '../..');
if (!fs.existsSync(path.join(EXTENSION_ROOT, 'package.json'))) {
  EXTENSION_ROOT = path.resolve(_dirname, '..');
}

/**
 * ProjectContext: Immutable data about the local repository environment.
 */
export interface ProjectContext {
  repoRoot: string;
  repoName: string;
}

/**
 * InfrastructureSpec: Data required to build/connect to a station.
 */
export interface InfrastructureSpec {
  projectId?: string | undefined;
  zone?: string | undefined;
  instanceName?: string | undefined; // Required primary key for provisioning
  stationName?: string | undefined;
  providerType?: 'gce' | 'local-worktree' | 'local-workspace' | undefined;
  backendType?: 'direct-internal' | 'external' | undefined;
  imageUri?: string | undefined;
  upstreamRepo?: string | undefined;
  upstreamUrl?: string | undefined;
  manageNetworking?: boolean | undefined;
  vpcName?: string | undefined;
  subnetName?: string | undefined;
  machineType?: string | undefined;
  sshSourceRanges?: string[] | undefined;
  workspacesDir?: string | undefined;
  worktreesDir?: string | undefined; // Compatibility
  remoteWorkDir?: string | undefined;
  useTmux?: boolean | undefined;
  cpuLimit?: string | undefined;
  memoryLimit?: string | undefined;
  reaperIdleLimit?: number | undefined;
  dnsSuffix?: string | undefined;
  userSuffix?: string | undefined;
  sshUser?: string | undefined;
  schematic?: string | undefined;
  verbose?: boolean | undefined;
}

/**
 * OrbitContext: The unified, hydrated world-view used by the entire SDK.
 */
export interface OrbitContext {
  project: ProjectContext;
  infra: InfrastructureSpec;
}

/**
 * MissionSpec: Parameters for a specific execution.
 */
export interface MissionSpec {
  identifier: string;
  action: string;
  args?: string[] | undefined;
  sensitiveEnv?: Record<string, string> | undefined;
}

/**
 * Resolves the primary repository root (the 'main' clone) even if currently in a worktree.
 */
export function getPrimaryRepoRoot(repoRoot: string = process.cwd()): string {
  if (process.env.GCLI_ORBIT_REPO_NAME) {
    const devDir = path.join(os.homedir(), 'dev');
    const possiblePaths = [
      path.join(devDir, process.env.GCLI_ORBIT_REPO_NAME, 'main'),
      path.join(devDir, process.env.GCLI_ORBIT_REPO_NAME),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(path.join(p, '.git'))) return p;
    }
  }

  try {
    const res = spawnSync('git', ['rev-parse', '--git-common-dir'], {
      stdio: 'pipe',
      cwd: repoRoot,
    });
    if (res.status === 0) {
      const commonDir = res.stdout.toString().trim();
      if (commonDir === '.git') return repoRoot;
      return path.resolve(repoRoot, path.dirname(commonDir));
    }
  } catch (_e) {}
  return repoRoot;
}

/**
 * Standardized paths on the REMOTE station (Hardware Host)
 */
export const ORBIT_ROOT = '/mnt/disks/data';
export const MAIN_REPO_PATH = `${ORBIT_ROOT}/main`;
export const SATELLITE_WORKSPACES_PATH = `${ORBIT_ROOT}/workspaces`;
export const SATELLITE_WORKTREES_PATH = SATELLITE_WORKSPACES_PATH; // Compatibility
export const POLICIES_PATH = `${ORBIT_ROOT}/policies`;
export const SCRIPTS_PATH = `${ORBIT_ROOT}/scripts`;
export const CONFIG_DIR = `${ORBIT_ROOT}/gemini-cli-config/.gemini`;
export const EXTENSION_REMOTE_PATH = `${ORBIT_ROOT}/extension`;
export const BUNDLE_PATH = `${ORBIT_ROOT}/bundle`;
export const ORBIT_STATE_PATH = '.gemini/orbit/state.json';

/**
 * Standardized paths INSIDE the Agent Capsule (Docker Container)
 * Aligned with orbit-capsule.Dockerfile
 */
export const CAPSULE_WORKDIR = '/home/node/dev/main';
export const CAPSULE_CLI_ROOT = '/usr/local/lib/gemini-cli';
export const CAPSULE_BUNDLE_PATH = `${CAPSULE_CLI_ROOT}/bundle`;
export const STATION_BUNDLE_PATH = `${BUNDLE_PATH}/station.js`;
export const CAPSULE_MANIFEST_PATH = '/home/node/.orbit-manifest.json';
export const LOCAL_MANIFEST_NAME = '.orbit-manifest.json';

/**
 * Standardized paths on the LOCAL machine (The Extension itself)
 */
export const LOCAL_SCRIPTS_PATH = path.join(EXTENSION_ROOT, 'src');
export const LOCAL_POLICIES_PATH = path.join(
  EXTENSION_ROOT,
  '.gemini/policies',
);
export const LOCAL_BUNDLE_PATH = path.join(EXTENSION_ROOT, 'bundle');

/**
 * Configuration Paths (Global)
 */
export const GLOBAL_GEMINI_DIR = path.join(os.homedir(), '.gemini');
export const GLOBAL_SETTINGS_FILE = path.join(
  GLOBAL_GEMINI_DIR,
  'settings.json',
);
export const GLOBAL_ACCOUNTS_FILE = path.join(
  GLOBAL_GEMINI_DIR,
  'google_accounts.json',
);
export const GLOBAL_GH_CONFIG = path.join(os.homedir(), '.config/gh/hosts.yml');

export const GLOBAL_ORBIT_DIR = path.join(GLOBAL_GEMINI_DIR, 'orbit');
export const GLOBAL_SETTINGS_PATH = path.join(
  GLOBAL_ORBIT_DIR,
  'settings.json',
);
export const SCHEMATICS_DIR = path.join(GLOBAL_ORBIT_DIR, 'schematics');
export const STATIONS_DIR = path.join(GLOBAL_ORBIT_DIR, 'stations');
export const PULUMI_STATE_DIR = path.join(GLOBAL_ORBIT_DIR, 'state');
export const ORBIT_BIN_DIR = path.join(GLOBAL_ORBIT_DIR, 'bin');
export const GLOBAL_TOKENS_DIR = path.join(GLOBAL_ORBIT_DIR, 'tokens');
export const DEFAULT_TEMP_DIR = path.join(GLOBAL_ORBIT_DIR, 'tmp');

/**
 * Dynamic Project Paths
 */
export function getProjectOrbitDir(repoRoot: string): string {
  return path.join(repoRoot, '.gemini/orbit');
}

export function getProjectConfigPath(repoRoot: string): string {
  return path.join(getProjectOrbitDir(repoRoot), 'config.json');
}

export function getLocalSettingsPath(repoRoot: string): string {
  return path.join(getProjectOrbitDir(repoRoot), 'settings.json');
}

export function getOrbitLogPath(repoRoot: string): string {
  return path.join(getProjectOrbitDir(repoRoot), 'orbit.log');
}

/**
 * Repository Metadata
 */
export const UPSTREAM_REPO_URL =
  'https://github.com/google-gemini/gemini-cli.git';
export const DEFAULT_REPO_NAME = 'gemini-cli';
export const UPSTREAM_ORG = 'google-gemini';

/**
 * Networking Defaults
 */
export const DEFAULT_DNS_SUFFIX = '';
export const DEFAULT_USER_SUFFIX = '';
export const DEFAULT_VPC_NAME = 'orbit';
export const DEFAULT_SUBNET_NAME = 'orbit';
export const DEFAULT_IMAGE_URI =
  'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';

/**
 * Orbit Configuration Interface (Legacy - for compatibility during refactor)
 */
export interface OrbitConfig extends InfrastructureSpec {
  upstreamRepo?: string | undefined;
  repoName?: string | undefined;
  repoRoot?: string | undefined;
  terminalTarget?: 'foreground' | 'background' | 'tab' | 'window' | undefined;
  userFork?: string | undefined;
  remoteHost?: string | undefined;
  useContainer?: boolean | undefined;
  profile?: string | undefined;
  schematic?: string | undefined;
  forStation?: string | undefined;
  local?: boolean | undefined;
  manageNetworking?: boolean | undefined;
  tempDir?: string | undefined;
  autoClean?: boolean | undefined;
  verbose?: boolean | undefined;
  dataDiskType?: string | undefined;
  bootDiskType?: string | undefined;
}

/**
 * Global Settings File Structure
 */
export interface OrbitSettings {
  repos: Record<
    string,
    OrbitConfig & {
      activeStation?: string | undefined;
    }
  >;
  activeRepo?: string | undefined;
  activeStation?: string | undefined; // Global default
  tempDir?: string | undefined;
  workspacesDir?: string | undefined;
  worktreesDir?: string | undefined; // Compatibility
  autoClean?: boolean | undefined;
}

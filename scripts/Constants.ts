/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

/**
 * Resolves the primary repository root (the 'main' clone) even if currently in a worktree.
 * This is now an exported function to avoid module-load time hangs.
 */
export function getPrimaryRepoRoot(): string {
  // If we are explicitly told which repo to use, try to find its main folder
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
    });
    if (res.status === 0) {
      const commonDir = res.stdout.toString().trim();
      // If commonDir is just ".git", we are in the main repo already
      if (commonDir === '.git') return REPO_ROOT;
      // Otherwise, commonDir is an absolute path to the main .git folder
      return path.dirname(commonDir);
    }
  } catch (e) {
    // Fallback to CWD if git fails
  }
  return REPO_ROOT;
}

/**
 * Standardized paths
 */
export const ORBIT_ROOT = '/mnt/disks/data';
export const MAIN_REPO_PATH = `${ORBIT_ROOT}/main`;
export const SATELLITE_WORKTREES_PATH = `${ORBIT_ROOT}/worktrees`;
export const POLICIES_PATH = `${ORBIT_ROOT}/policies`;
export const SCRIPTS_PATH = `${ORBIT_ROOT}/scripts`;
export const CONFIG_DIR = `${ORBIT_ROOT}/gemini-cli-config/.gemini`;
export const EXTENSION_REMOTE_PATH = `${ORBIT_ROOT}/extension`;

export const LOCAL_SCRIPTS_PATH = path.join(REPO_ROOT, 'scripts');
export const LOCAL_POLICIES_PATH = path.join(REPO_ROOT, '.gemini/policies');
export const LOCAL_BUNDLE_PATH = path.join(REPO_ROOT, 'bundle');

export const BUNDLE_PATH = `${ORBIT_ROOT}/bundle`;

/**
 * Configuration Paths
 */
export const GLOBAL_ORBIT_DIR = path.join(os.homedir(), '.gemini/orbit');
export const GLOBAL_SETTINGS_PATH = path.join(
  GLOBAL_ORBIT_DIR,
  'settings.json',
);
export const SCHEMATICS_DIR = path.join(GLOBAL_ORBIT_DIR, 'schematics');
export const STATIONS_DIR = path.join(GLOBAL_ORBIT_DIR, 'stations');
export const GLOBAL_TOKENS_DIR = path.join(GLOBAL_ORBIT_DIR, 'tokens');
export const DEFAULT_TEMP_DIR = path.join(GLOBAL_ORBIT_DIR, 'tmp');

export const PROJECT_ORBIT_DIR = path.join(REPO_ROOT, '.gemini/orbit');
export const PROJECT_CONFIG_PATH = path.join(PROJECT_ORBIT_DIR, 'config.json');
export const LOCAL_SETTINGS_PATH = path.join(
  PROJECT_ORBIT_DIR,
  'settings.json',
);
export const ORBIT_LOG_PATH = path.join(PROJECT_ORBIT_DIR, 'orbit.log');

/**
 * Repository Metadata
 */
export const UPSTREAM_REPO_URL =
  'https://github.com/google-gemini/gemini-cli.git';
export const DEFAULT_REPO_NAME = 'gemini-cli';
export const UPSTREAM_ORG = 'google-gemini';

/**
 * Networking Defaults (General GCP standard)
 */
export const DEFAULT_DNS_SUFFIX = '';
export const DEFAULT_USER_SUFFIX = '';
export const DEFAULT_IMAGE_URI =
  'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';

/**
 * Orbit Configuration Interface
 */
export interface OrbitConfig {
  projectId?: string | undefined;
  zone?: string | undefined;
  instanceName?: string | undefined;
  terminalTarget?: 'foreground' | 'background' | 'tab' | 'window' | undefined;
  userFork?: string | undefined;
  upstreamRepo?: string | undefined;
  repoName?: string | undefined;
  remoteHost?: string | undefined;
  remoteWorkDir?: string | undefined;
  useContainer?: boolean | undefined;
  providerType?: 'gce' | 'local-worktree' | undefined;
  dnsSuffix?: string | undefined;
  userSuffix?: string | undefined;
  backendType?: 'direct-internal' | 'external' | undefined;
  imageUri?: string | undefined;
  vpcName?: string | undefined;
  subnetName?: string | undefined;
  profile?: string | undefined; // Legacy
  schematic?: string | undefined;
  forStation?: string | undefined;
  worktreesDir?: string | undefined;
  useTmux?: boolean | undefined;
  autoSetupNet?: boolean | undefined;
  machineType?: string | undefined;
  sshSourceRanges?: string[] | undefined;
  tempDir?: string | undefined;
  autoClean?: boolean | undefined;
  cpuLimit?: string | undefined;
  memoryLimit?: string | undefined;
  reaperIdleLimit?: number | undefined;
}

/**
 * Global Settings File Structure
 */
export interface OrbitSettings {
  repos: Record<string, OrbitConfig>;
  activeRepo?: string;
  activeStation?: string;
  tempDir?: string;
  autoClean?: boolean;
}

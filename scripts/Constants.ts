/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';

const REPO_ROOT = process.cwd();

/**
 * Canonical paths for the Gemini Orbit system.
 * Standardized across Host Station and Satellite Capsules.
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
export const PROFILES_DIR = path.join(GLOBAL_ORBIT_DIR, 'profiles');
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
 * Used for both Profiles and Repository-specific settings.
 */
export interface OrbitConfig {
  projectId?: string | undefined;
  zone?: string | undefined;
  instanceName?: string | undefined; // The GCE station name
  terminalTarget?: 'foreground' | 'background' | 'tab' | 'window' | undefined;
  userFork?: string | undefined;
  upstreamRepo?: string | undefined;
  repoName?: string | undefined;
  remoteHost?: string | undefined;
  remoteWorkDir?: string | undefined;
  useContainer?: boolean | undefined;
  providerType?:
    | 'gce'
    | 'local-docker'
    | 'local-worktree'
    | 'podman'
    | undefined;
  dnsSuffix?: string | undefined;
  userSuffix?: string | undefined;
  backendType?: 'direct-internal' | 'external' | 'iap' | undefined;
  imageUri?: string | undefined;
  vpcName?: string | undefined;
  subnetName?: string | undefined;
  profile?: string | undefined; // Link to a named profile in PROFILES_DIR
  worktreesDir?: string | undefined; // Local worktrees base path
  useTmux?: boolean | undefined; // Whether to wrap execution in tmux
  autoSetupNet?: boolean | undefined; // Whether to auto-configure networking
  machineType?: string | undefined; // GCE Machine type (e.g. n2-standard-8)
  sshSourceRanges?: string[] | undefined; // Custom source ranges for SSH firewall rule
  tempDir?: string | undefined; // Base directory for temporary output
  autoClean?: boolean | undefined; // Whether to auto-delete session temp dirs
  cpuLimit?: string | undefined; // Container CPU limit (e.g. '2')
  memoryLimit?: string | undefined; // Container Memory limit (e.g. '8g')
  reaperIdleLimit?: number | undefined; // Auto-shutdown idle threshold in hours (e.g. 24)
}

/**
 * Global Settings File Structure (~/.gemini/orbit/settings.json)
 */
export interface OrbitSettings {
  repos: Record<string, OrbitConfig>;
  activeRepo?: string;
  activeProfile?: string; // Global default profile
  tempDir?: string; // Global default temp dir
  autoClean?: boolean; // Global default auto-clean
  // Legacy support
  orbit?: OrbitConfig;
}

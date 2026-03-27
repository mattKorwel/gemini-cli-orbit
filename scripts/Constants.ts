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

/**
 * Configuration Paths
 */
export const GLOBAL_ORBIT_DIR = path.join(os.homedir(), '.gemini/orbit');
export const GLOBAL_SETTINGS_PATH = path.join(GLOBAL_ORBIT_DIR, 'settings.json');
export const PROFILES_DIR = path.join(GLOBAL_ORBIT_DIR, 'profiles');

export const PROJECT_ORBIT_DIR = path.join(REPO_ROOT, '.gemini/orbit');
export const PROJECT_CONFIG_PATH = path.join(PROJECT_ORBIT_DIR, 'config.json');
export const LOCAL_SETTINGS_PATH = path.join(PROJECT_ORBIT_DIR, 'settings.json');

/**
 * Repository Metadata
 */
export const UPSTREAM_REPO_URL = 'https://github.com/google-gemini/gemini-cli.git';
export const DEFAULT_REPO_NAME = 'gemini-cli';
export const UPSTREAM_ORG = 'google-gemini';

/**
 * Networking Defaults (General GCP standard)
 */
export const DEFAULT_DNS_SUFFIX = '';
export const DEFAULT_USER_SUFFIX = '';
export const DEFAULT_IMAGE_URI = 'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:mk-worker-refactor';

/**
 * Orbit Configuration Interface
 * Used for both Profiles and Repository-specific settings.
 */
export interface OrbitConfig {
  projectId?: string;
  zone?: string;
  instanceName?: string; // The GCE station name
  terminalTarget?: 'foreground' | 'background' | 'tab' | 'window';
  userFork?: string;
  upstreamRepo?: string;
  repoName?: string;
  remoteHost?: string;
  remoteWorkDir?: string;
  useContainer?: boolean;
  providerType?: 'gce' | 'local-docker' | 'local-worktree' | 'podman';
  dnsSuffix?: string;
  userSuffix?: string;
  backendType?: 'direct-internal' | 'external' | 'iap';
  imageUri?: string;
  vpcName?: string;
  subnetName?: string;
  profile?: string; // Link to a named profile in PROFILES_DIR
  worktreesDir?: string; // Local worktrees base path
  useTmux?: boolean; // Whether to wrap execution in tmux
}

/**
 * Global Settings File Structure (~/.gemini/orbit/settings.json)
 */
export interface OrbitSettings {
  repos: Record<string, OrbitConfig>;
  activeRepo?: string;
  activeProfile?: string; // Global default profile
  // Legacy support
  orbit?: OrbitConfig;
}

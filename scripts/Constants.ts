/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';

const REPO_ROOT = process.cwd();

/**
 * Canonical paths for the Workspace system.
 * Standardized across Host and Container.
 */
export const WORKSPACES_ROOT = '/mnt/disks/data';
export const MAIN_REPO_PATH = `${WORKSPACES_ROOT}/main`;
export const WORKTREES_PATH = `${WORKSPACES_ROOT}/worktrees`;
export const POLICIES_PATH = `${WORKSPACES_ROOT}/policies`;
export const SCRIPTS_PATH = `${WORKSPACES_ROOT}/scripts`;
export const CONFIG_DIR = `${WORKSPACES_ROOT}/gemini-cli-config/.gemini`;
export const EXTENSION_REMOTE_PATH = `${WORKSPACES_ROOT}/extension`;

/**
 * Configuration Paths
 */
export const GLOBAL_WORKSPACES_DIR = path.join(os.homedir(), '.gemini/workspaces');
export const GLOBAL_SETTINGS_PATH = path.join(GLOBAL_WORKSPACES_DIR, 'settings.json');
export const PROFILES_DIR = path.join(GLOBAL_WORKSPACES_DIR, 'profiles');

export const PROJECT_WORKSPACES_DIR = path.join(REPO_ROOT, '.gemini/workspaces');
export const PROJECT_CONFIG_PATH = path.join(PROJECT_WORKSPACES_DIR, 'config.json');
export const LOCAL_SETTINGS_PATH = path.join(PROJECT_WORKSPACES_DIR, 'settings.json');

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
 * Workspace Configuration Interface
 * Used for both Profiles and Repository-specific settings.
 */
export interface WorkspaceConfig {
  projectId?: string;
  zone?: string;
  instanceName?: string; // The GCE instance name
  terminalTarget?: 'foreground' | 'background' | 'tab' | 'window';
  userFork?: string;
  upstreamRepo?: string;
  repoName?: string;
  remoteHost?: string;
  remoteWorkDir?: string;
  useContainer?: boolean;
  providerType?: 'gce' | 'local-docker';
  dnsSuffix?: string;
  userSuffix?: string;
  backendType?: 'direct-internal' | 'external' | 'iap';
  imageUri?: string;
  vpcName?: string;
  subnetName?: string;
  profile?: string; // Link to a named profile in PROFILES_DIR
}

/**
 * Global Settings File Structure (~/.gemini/workspaces/settings.json)
 */
export interface WorkspaceSettings {
  repos: Record<string, WorkspaceConfig>;
  activeRepo?: string;
  activeProfile?: string; // Global default profile
  // Legacy support
  workspace?: WorkspaceConfig;
}

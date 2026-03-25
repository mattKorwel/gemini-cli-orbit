/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

/**
 * Repository Metadata
 */
export const UPSTREAM_REPO_URL = 'https://github.com/google-gemini/gemini-cli.git';
export const DEFAULT_REPO_NAME = 'gemini-cli';
export const UPSTREAM_ORG = 'google-gemini';

/**
 * Networking Defaults (General GCP standard)
 */
export const DEFAULT_DNS_SUFFIX = '.c.${projectId}.internal';
export const DEFAULT_USER_SUFFIX = '';

/**
 * Workspace Configuration Interface
 */
export interface WorkspaceConfig {
  projectId: string;
  zone: string;
  terminalTarget: 'foreground' | 'background' | 'tab' | 'window';
  userFork: string;
  upstreamRepo: string;
  remoteHost: string;
  remoteWorkDir: string;
  useContainer: boolean;
  providerType?: 'gce' | 'local-docker';
  dnsSuffix?: string;
  userSuffix?: string;
  backendType?: 'direct-internal' | 'external' | 'iap';
}

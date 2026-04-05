/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type InfrastructureSpec,
  type ProjectContext,
  type OrbitConfig,
  type OrbitSettings,
} from './Constants.js';
import { type SchematicInfo } from './types.js';
import { type OrbitProvider } from '../providers/BaseProvider.js';
import { type InfrastructureState } from '../infrastructure/InfrastructureState.js';
import { type InfrastructureProvisioner } from '../infrastructure/InfrastructureProvisioner.js';

export interface StationReceipt {
  name: string;
  instanceName: string;
  type: 'gce' | 'local-worktree';
  projectId: string;
  zone: string;
  repo: string;
  status?: string;
  backendType?: 'direct-internal' | 'external';
  schematic?: string;
  rootPath?: string;
  lastSeen: string;
}

/**
 * Station Registry: Management of local receipts for remote/local stations.
 */
export interface IStationRegistry {
  saveReceipt(receipt: StationReceipt): void;
  deleteReceipt(name: string): void;
  listStations(options?: {
    syncWithReality?: boolean;
  }): Promise<StationReceipt[]>;
  getMissions(receipt: StationReceipt): Promise<string[]>;
}

/**
 * Schematic Manager: Management of infrastructure blueprints.
 */
export interface ISchematicManager {
  listSchematics(): SchematicInfo[];
  importSchematic(source: string): Promise<string>;
  runWizard(name: string, cliFlags?: Partial<OrbitConfig>): Promise<void>;
}

/**
 * Provider Factory: Creates OrbitProvider instances.
 */
export interface IProviderFactory {
  getProvider(
    projectCtx: ProjectContext,
    infra: InfrastructureSpec,
    state?: InfrastructureState,
  ): OrbitProvider;
}

/**
 * Infrastructure Factory: Creates InfrastructureProvisioner instances.
 */
export interface IInfrastructureFactory {
  getProvisioner(
    schematicName: string,
    config: OrbitConfig,
  ): InfrastructureProvisioner;
}

export interface IProcessResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface IRunOptions {
  cwd?: string;
  env?: Record<string, string> | undefined;
  interactive?: boolean;
  quiet?: boolean;
  stdio?: 'inherit' | 'pipe' | 'ignore' | undefined;
}

/**
 * Process Manager: Centralized utility for consistent process execution.
 */
export interface IProcessManager {
  runSync(bin: string, args: string[], options?: IRunOptions): IProcessResult;
}

/**
 * Dependency Manager: Manages external binary dependencies (e.g. Pulumi).
 */
export interface IDependencyManager {
  ensurePulumi(): Promise<string>;
}

/**
 * Shell Integration: Manages shell profile integration (aliases, completion).
 */
export interface IShellIntegration {
  detectShell(): string;
  getProfilePath(shell: string): string | null;
  install(shimPath: string, targetShell?: string): boolean;
}

/**
 * Configuration Manager: Low-level access to settings and schematics on disk.
 */
export interface IConfigManager {
  loadSettings(): OrbitSettings;
  saveSettings(settings: OrbitSettings): void;
  loadSchematic(name: string): Partial<OrbitConfig>;
  saveSchematic(name: string, config: any): void;
  loadJson(path: string): any;
  detectRemoteUrl(repoRoot: string): string | null;
}

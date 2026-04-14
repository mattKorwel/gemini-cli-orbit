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
import {
  type SchematicInfo,
  type SyncOptions,
  type ExecOptions,
  type ExecResult,
  type OrbitObserver,
} from './types.js';
import { type Command } from './executors/types.js';
import { type OrbitProvider } from '../providers/BaseProvider.js';
import { type InfrastructureState } from '../infrastructure/InfrastructureState.js';
import { type InfrastructureProvisioner } from '../infrastructure/InfrastructureProvisioner.js';

export type IOrbitObserver = OrbitObserver;

export interface StationReceipt {
  name: string;
  instanceName: string;
  type: 'gce' | 'local-worktree' | 'local-git' | 'local-docker';
  projectId: string;
  zone: string;
  repo: string;
  upstreamUrl?: string | undefined;
  status?: string;
  networkAccessType?: 'direct-internal' | 'external';
  schematic?: string | undefined;
  rootPath?: string | undefined;
  workspacesDir?: string;
  dnsSuffix?: string | undefined;
  userSuffix?: string | undefined;
  sshUser?: string | undefined;
  externalIp?: string | undefined;
  lastSeen: string;
}
export interface HydratedStation {
  receipt: StationReceipt;
  provider: import('../providers/BaseProvider.js').OrbitProvider;
}

/**
 * Station Registry: Management of local receipts for remote/local stations.
 */
export interface IStationRegistry {
  saveReceipt(receipt: StationReceipt): void;
  deleteReceipt(name: string): void;
  listStations(): Promise<HydratedStation[]>;
}

/**
 * Schematic Manager: Management of infrastructure blueprints.
 */
export interface ISchematicManager {
  seed(): void;
  listSchematics(): SchematicInfo[];
  deleteSchematic(name: string): void;
  importSchematic(source: string): Promise<string>;
  runWizard(name: string, cliFlags?: Partial<OrbitConfig>): Promise<void>;
  prepareGcp(
    options: import('../utils/GcpPrepare.js').PrepareOptions,
  ): Promise<import('../utils/GcpPrepare.js').CheckResult[]>;
}

/**
 * Status Manager: High-level aggregator for fleet state.
 */
export interface IStatusManager {
  getPulse(): Promise<import('./types.js').StationState>;
  getGlobalLocalPulse(): Promise<import('./types.js').StationState[]>;
  fetchFleetState(
    stations: HydratedStation[],
    depth: 'health' | 'pulse',
    peek?: boolean,
  ): Promise<import('./types.js').StationState[]>;
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

/**
 * StationTransport: Abstraction for connectivity to a Station host.
 * Supports both Direct (Local) and SSH (Remote) implementations.
 */
export interface StationTransport {
  readonly type: 'identity' | 'ssh';

  /**
   * Executes a command on the host.
   */
  exec(command: string | Command, options?: ExecOptions): Promise<ExecResult>;

  /**
   * Attaches to a persistent TTY session on the host.
   */
  attach(containerName: string, sessionName: string): Promise<number>;

  /**
   * Opens a raw interactive shell inside a running mission container.
   */
  missionShell(
    containerName: string,
    workDir?: string,
    sessionName?: string,
  ): Promise<number>;

  /**
   * Transfers files between local and host.
   */
  sync(
    localPath: string,
    remotePath: string,
    options?: SyncOptions,
  ): Promise<number>;

  /**
   * Ensures a port forward tunnel is active (SSH only).
   */
  ensureTunnel(localPort: number, remotePort: number): Promise<void>;

  /**
   * Returns the connection handle (e.g. user@host).
   */
  getConnectionHandle(): string;

  /**
   * Overrides the target host (e.g. with a newly provisioned public IP).
   */
  setOverrideHost(host: string): void;

  /**
   * Returns the connection handle used for SSH-backed file transfers.
   */
  getMagicRemote(): string;
}

export interface IProcessResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface IRunOptions {
  cwd?: string;
  env?: Record<string, string>;
  interactive?: boolean;
  quiet?: boolean;
  stream?: boolean; // Real-time streaming to console
  detached?: boolean;
  shell?: boolean;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  stdio?:
    | 'inherit'
    | 'pipe'
    | 'ignore'
    | ('inherit' | 'pipe' | 'ignore' | number | any)[];
}

/**
 * Process Manager: Centralized utility for consistent process execution.
 */
export interface IProcessManager {
  runSync(bin: string, args: string[], options?: IRunOptions): IProcessResult;
  run(
    bin: string,
    args: string[],
    options?: IRunOptions,
  ): Promise<IProcessResult>;
  runAsync(
    bin: string,
    args: string[],
    options?: IRunOptions,
  ): import('node:child_process').ChildProcess;
  spawn(
    bin: string,
    args: string[],
    options?: IRunOptions,
  ): import('node:child_process').ChildProcess;
}

export interface IGitExecutor {
  init(cwd: string, options?: IRunOptions): IProcessResult;
  remoteAdd(
    cwd: string,
    name: string,
    url: string,
    options?: IRunOptions,
  ): IProcessResult;
  fetch(
    cwd: string,
    remote: string,
    branch: string,
    options?: IRunOptions,
  ): IProcessResult;
  checkout(cwd: string, branch: string, options?: IRunOptions): IProcessResult;
  checkoutNew(
    cwd: string,
    branch: string,
    base?: string,
    options?: IRunOptions,
  ): IProcessResult;
  worktreeAdd(
    cwd: string,
    path: string,
    branch: string,
    options?: IRunOptions,
  ): IProcessResult;
  verify(cwd: string, branch: string, options?: IRunOptions): IProcessResult;
  revParse(cwd: string, args: string[], options?: IRunOptions): IProcessResult;
}

export interface IDockerExecutor {
  exec(
    container: string,
    command: string[],
    options?: IRunOptions,
  ): IProcessResult;
  run(
    image: string,
    command?: string,
    options?: IRunOptions & {
      name?: string;
      user?: string | undefined;
      mounts?: { host: string; capsule: string; readonly?: boolean }[];
      tmpfs?: string[];
      label?: string;
    },
  ): import('./executors/types.js').Command;
  stop(container: string): import('./executors/types.js').Command;
  remove(container: string): import('./executors/types.js').Command;
}

export interface ITmuxExecutor {
  wrapMission(
    sessionName: string,
    innerCommand: string,
    options?: IRunOptions,
  ): import('./executors/types.js').Command;
  wrap(
    sessionName: string,
    innerCommand: string,
    options?: IRunOptions & { detached?: boolean },
  ): import('./executors/types.js').Command;
  attach(sessionName: string): IProcessResult;
  hasSession(sessionName: string): import('./executors/types.js').Command;
  killSession(sessionName: string): import('./executors/types.js').Command;
  listSessions(): import('./executors/types.js').Command;
  capturePane(sessionName: string): import('./executors/types.js').Command;
  version(): import('./executors/types.js').Command;
}

export interface INodeExecutor {
  create(
    scriptPath: string,
    args?: string[],
    options?: IRunOptions,
  ): import('./executors/types.js').Command;
  createRemote(
    scriptPath: string,
    args?: string[],
    options?: IRunOptions,
  ): import('./executors/types.js').Command;
}

export interface IGeminiExecutor {
  create(bin: string, options?: any): import('./executors/types.js').Command;
}

export interface IExecutors {
  git: IGitExecutor;
  docker: IDockerExecutor;
  tmux: ITmuxExecutor;
  node: INodeExecutor;
  gemini: IGeminiExecutor;
  ssh: import('./executors/ssh/SshExecutor.js').ISshExecutor;
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
  getAvailableShells(): string[];
  getProfilePath(shell: string): string | null;
  getProfilePaths(shell: string): string[];
  install(shimPath: string, targetShell?: string): boolean;
  isInstalled(profilePath: string): boolean;
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

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type OrbitConfig } from './Constants.js';
import { type LogLevel } from './Logger.js';

/**
 * Interface for observing SDK activities.
 * Allows UI layers (CLI, MCP) to handle progress and logging.
 */
export interface OrbitObserver {
  onProgress?(phase: string, message: string, progress?: number): void;
  onLog?(level: LogLevel, tag: string, message: string, ...args: any[]): void;
  onDivider?(title?: string): void;
  setVerbose?(verbose: boolean): void;
}

/**
 * Structured result for a Mission.
 */
export interface MissionResult {
  missionId: string;
  exitCode: number;
  message?: string;
}

/**
 * Structured info for a Mission Capsule.
 */
export interface CapsuleInfo {
  name: string;
  repo?: string;
  mission?: string;
  state:
    | 'IDLE'
    | 'WAITING'
    | 'THINKING'
    | 'WAITING_FOR_INPUT'
    | 'WAITING_FOR_APPROVAL'
    | 'COMPLETED'
    | 'UNKNOWN';
  stats?: any;
  lastThought?: string | undefined;
  blocker?: string | undefined;
  progress?: string | undefined;
  pendingTool?: string | undefined;
  lastQuestion?: string | undefined;
}

/**
 * Unified state model for an Orbit Station (Hardware + Missions).
 */
export interface StationState {
  receipt: import('../core/interfaces.js').StationReceipt;
  isActive: boolean;
  reality?: {
    status: string;
    internalIp?: string;
    externalIp?: string;
    missions: CapsuleInfo[];
  };
}

/**
 * Structured result for CI monitoring.
 */
export interface CIStatus {
  runs: string[];
  status: 'PENDING' | 'PASSED' | 'FAILED' | 'NOT_FOUND';
  failures?: Map<string, Set<string>>;
  testCommand?: string;
}

/**
 * Immutable unit of truth for a mission's state and configuration.
 * Passed via the GCLI_ORBIT_MANIFEST environment variable.
 */
export interface MissionManifest {
  identifier: string; // The user's ID (PR # or branch name)
  repoName: string; // The sanitized repository name
  branchName: string; // The resolved git branch
  action: string; // The playbook action (chat, fix, review, etc.)
  workspaceName: string; // The hierarchical workspace identifier (relative path)
  workDir: string; // The absolute path to the workspace
  containerName: string; // The name of the mission container
  policyPath: string; // The absolute path to the active policy
  sessionName: string; // The user-friendly hierarchical session name
  upstreamUrl: string; // The git remote origin URL
  mirrorPath?: string; // Optional path to local git mirror
  verbose?: boolean | undefined; // Whether to enable detailed logging
  tempDir?: string | undefined; // Root directory for temporary logs and artifacts
}

/**
 * Options for starting a mission.
 */
export interface MissionOptions {
  identifier: string;
  action: string;
  args?: string[];
}

/**
 * Options for jettisoning a mission.
 */
export interface JettisonOptions {
  identifier: string;
  action?: string | undefined;
}

/**
 * Options for reaping idle missions.
 */
export interface ReapOptions {
  threshold?: number | undefined;
  force?: boolean | undefined;
}

/**
 * Options for attaching to a mission.
 */
export interface AttachOptions {
  identifier: string;
  action?: string | undefined;
}

/**
 * Options for fetching mission logs.
 */
export interface GetLogsOptions {
  identifier: string;
  action?: string | undefined;
}

/**
 * Options for provisioning a station.
 */
export interface ProvisionOptions {
  stationName?: string | undefined;
  schematicName?: string | undefined;
  destroy?: boolean | undefined;
}

/**
 * Options for listing stations.
 */
export interface ListStationsOptions {
  syncWithReality?: boolean | undefined;
  includeMissions?: boolean | undefined;
  repoFilter?: string | undefined;
  nameFilter?: string | undefined;
  missionFilter?: string | undefined;
  peek?: boolean | undefined;
  all?: boolean | undefined;
}

/**
 * Options for monitoring CI.
 */
export interface MonitorCIOptions {
  branch?: string | undefined;
  runId?: string | undefined;
}

/**
 * Options for emergency splashdown.
 */
export interface SplashdownOptions {
  name?: string | undefined;
  all?: boolean | undefined;
  force?: boolean | undefined;
}

/**
 * Options for hibernating a station.
 */
export interface HibernateOptions {
  name: string;
}

/**
 * Options for deleting a station record.
 */
export interface DeleteStationOptions {
  name: string;
}

/**
 * Options for executing a command in a mission.
 */
export interface MissionExecOptions {
  identifier: string;
  command: string;
  action?: string | undefined;
}

/**
 * The Orbit SDK - Central functional core (Facade).
 */
export interface IOrbitSDK {
  readonly observer: OrbitObserver;
  getPulse(): Promise<StationState>;
  getFleetState(options: ListStationsOptions): Promise<StationState[]>;
  startMission(manifest: MissionManifest): Promise<MissionResult>;
  resolveMission(options: MissionOptions): Promise<MissionManifest>;
  missionExec(options: MissionExecOptions): Promise<number>;
  jettisonMission(options: JettisonOptions): Promise<MissionResult>;
  reapMissions(options: ReapOptions): Promise<number>;
  monitorCI(options: MonitorCIOptions): Promise<CIStatus>;
  provisionStation(options: ProvisionOptions): Promise<number>;
  splashdown(options: SplashdownOptions): Promise<number>;
  hibernate(options: HibernateOptions): Promise<void>;
  attach(options: AttachOptions): Promise<number>;
  getLogs(options: GetLogsOptions): Promise<number>;
  installShell(): Promise<void>;
  listStations(options: ListStationsOptions): Promise<StationState[]>;
  activateStation(name: string): Promise<void>;
  listSchematics(): SchematicInfo[];
  getSchematic(name: string): OrbitConfig | null;
  saveSchematic(name: string, config: Partial<OrbitConfig>): Promise<void>;
  importSchematic(source: string): Promise<string>;
  runSchematicWizard(
    name: string,
    cliFlags?: Partial<OrbitConfig>,
  ): Promise<void>;

  /**
   * Drops into a raw interactive shell on the hardware host.
   */
  stationShell(): Promise<number>;

  /**
   * Drops into a raw interactive shell inside a mission capsule.
   */
  missionShell(options: { identifier: string }): Promise<number>;
}

/**
 * Metadata about an infrastructure blueprint.
 */
export interface SchematicInfo {
  name: string;
  projectId?: string;
  zone?: string;
  backendType?: string;
  machineType?: string;
}

export interface SetupOptions {
  projectId: string;
  zone: string;
  dnsSuffix?: string;
  userSuffix?: string;
  backendType?: string;
}
export interface ExecOptions {
  interactive?: boolean;
  cwd?: string; // Absolute source of truth for the filesystem location
  isolationId?: string; // Strictly for the isolation handle (Tmux session or Docker container name)
  user?: string; // Unix user for remote execution
  quiet?: boolean;
  env?: Record<string, string>;
  sensitiveEnv?: Record<string, string>;
  manifest?: MissionManifest;
}

export interface RemoteCommand {
  bin: string;
  args: string[];
  cwd?: string;
  user?: string;
  env?: Record<string, string>;
}

export interface CapsuleConfig {
  name: string;
  image: string;
  mounts: { host: string; capsule: string; readonly?: boolean }[];
  env?: Record<string, string>;
  sensitiveEnv?: Record<string, string>;
  cpuLimit?: string;
  memoryLimit?: string;
  command?: string | undefined;
  user?: string | undefined;
}

export interface SyncOptions {
  delete?: boolean;
  exclude?: string[];
  sudo?: boolean;
  quiet?: boolean;
}

export interface OrbitStatus {
  name: string;
  status: string;
  internalIp?: string;
  externalIp?: string;
}

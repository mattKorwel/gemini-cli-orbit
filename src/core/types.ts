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
  state: 'IDLE' | 'WAITING' | 'THINKING' | 'UNKNOWN';
  stats?: any;
}

/**
 * Structured result for Pulse check.
 */
export interface PulseInfo {
  stationName: string;
  repoName: string;
  status: string;
  internalIp?: string | undefined;
  externalIp?: string | undefined;
  capsules: CapsuleInfo[];
}

/**
 * Structured info for a Station.
 */
export interface StationInfo {
  name: string;
  type: 'gce' | 'local-worktree';
  repo: string;
  status?: string | undefined;
  projectId?: string | undefined;
  zone?: string | undefined;
  rootPath?: string | undefined;
  lastSeen?: string | undefined;
  missions: string[];
  isActive: boolean;
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
  schematicName?: string | undefined;
  destroy?: boolean | undefined;
}

/**
 * Options for listing stations.
 */
export interface ListStationsOptions {
  syncWithReality?: boolean | undefined;
  includeMissions?: boolean | undefined;
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
 * The Orbit SDK - Central functional core (Facade).
 */
export interface IOrbitSDK {
  readonly observer: OrbitObserver;
  getPulse(): Promise<PulseInfo>;
  startMission(options: MissionOptions): Promise<MissionResult>;
  jettisonMission(options: JettisonOptions): Promise<MissionResult>;
  reapMissions(options: ReapOptions): Promise<number>;
  monitorCI(options: MonitorCIOptions): Promise<CIStatus>;
  provisionStation(options: ProvisionOptions): Promise<number>;
  splashdown(options: SplashdownOptions): Promise<number>;
  hibernate(options: { name: string }): Promise<void>;
  attach(options: AttachOptions): Promise<number>;
  getLogs(options: GetLogsOptions): Promise<number>;
  installShell(): Promise<void>;
  listStations(options: ListStationsOptions): Promise<StationInfo[]>;
  activateStation(name: string): Promise<void>;
  listSchematics(): string[];
  getSchematic(name: string): OrbitConfig | null;
  saveSchematic(name: string, config: Partial<OrbitConfig>): Promise<void>;
  importSchematic(source: string): Promise<string>;
  runSchematicWizard(
    name: string,
    cliFlags?: Partial<OrbitConfig>,
  ): Promise<void>;
}

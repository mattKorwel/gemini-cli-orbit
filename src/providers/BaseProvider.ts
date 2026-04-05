/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';
import type { InfrastructureSpec } from '../core/Constants.js';
import type {
  ExecOptions,
  SyncOptions,
  OrbitStatus,
  CapsuleConfig,
} from '../core/types.js';
import { type Command } from '../core/executors/types.js';
import { type MissionContext } from '../utils/MissionUtils.js';

/**
 * OrbitProvider interface defines the contract for different remote
 * mission environments (GCE Station, Local Docker, etc.).
 */
export interface OrbitProvider {
  readonly type: 'gce' | 'local-worktree';
  readonly isLocal: boolean;
  projectId: string;
  zone: string;
  stationName: string;

  /**
   * Injects pre-discovered infrastructure state (e.g. from Pulumi).
   */
  injectState?(state: InfrastructureState): void;

  /**
   * Ensures the station is running and accessible.
   */
  ensureReady(): Promise<number>;

  /**
   * Returns the raw command string that would be used to execute a command.
   */
  getRunCommand(command: string, options?: ExecOptions): string;

  /**
   * Executes a command on the station.
   */
  exec(command: string | Command, options?: ExecOptions): Promise<number>;

  /**
   * Executes a command on the station and returns the output.
   */
  getExecOutput(
    command: string | Command,
    options?: ExecOptions,
  ): Promise<{ status: number; stdout: string; stderr: string }>;

  /**
   * Synchronizes local files to the station.
   */
  sync(
    localPath: string,
    remotePath: string,
    options?: SyncOptions,
  ): Promise<number>;

  syncIfChanged(
    localPath: string,
    remotePath: string,
    options?: SyncOptions,
  ): Promise<number>;

  /**
   * Prepares the workspace for a mission (e.g., creates worktree or ensures container).
   */
  prepareMissionWorkspace(
    mCtx: MissionContext,
    infra: InfrastructureSpec,
  ): Promise<void>;

  /**
   * Returns the status of the station.
   */
  getStatus(): Promise<OrbitStatus>;

  /**
   * Stops the station to save costs.
   */
  stop(): Promise<number>;

  /**
   * Returns the status of a specific capsule (container) in the station.
   */
  getCapsuleStatus(
    name: string,
  ): Promise<{ running: boolean; exists: boolean }>;

  /**
   * Returns resource usage stats for a specific capsule.
   */
  getCapsuleStats(name: string): Promise<string>;

  /**
   * Returns the number of seconds since the last activity in the capsule.
   */
  getCapsuleIdleTime(name: string): Promise<number>;

  /**
   * Attaches to an active mission capsule.
   */
  attach(name: string): Promise<number>;

  /**
   * Runs a capsule (container) with specific configuration.
   */
  runCapsule(config: CapsuleConfig): Promise<number>;

  /**
   * Stops a specific capsule.
   */
  stopCapsule(name: string): Promise<number>;

  /**
   * Stops and removes a specific capsule.
   */
  removeCapsule(name: string): Promise<number>;

  /**
   * Captures the contents of the current tmux pane in a capsule.
   */
  capturePane(capsuleName: string): Promise<string>;

  /**
   * Lists all stations for the current user/project.
   */
  listStations(): Promise<number>;

  /**
   * Destroys the station and its associated resources.
   */
  destroy(): Promise<number>;

  /**
   * Lists active mission capsules.
   */
  listCapsules(): Promise<string[]>;
  provisionMirror(remoteUrl: string): Promise<number>;

  /**
   * Drops into a raw interactive shell on the hardware host.
   */
  stationShell(): Promise<number>;

  /**
   * Drops into a raw interactive bash shell inside a mission capsule.
   */
  missionShell(capsuleName: string): Promise<number>;
}

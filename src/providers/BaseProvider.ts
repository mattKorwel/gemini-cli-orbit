/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';
import { type InfrastructureSpec } from '../core/Constants.js';
import type {
  ExecOptions,
  SyncOptions,
  OrbitStatus,
  CapsuleConfig,
  CapsuleInfo,
} from '../core/types.js';
import { type Command } from '../core/executors/types.js';
import { type MissionContext } from '../utils/MissionUtils.js';

import {
  type IExecutors,
  type IProcessManager,
  type StationReceipt,
} from '../core/interfaces.js';

/**
 * BaseProvider: Shared logic for all Orbit backends.
 * Centralizes naming policy with overridable defaults.
 */
export abstract class BaseProvider {
  abstract readonly type: 'gce' | 'local-worktree';
  abstract readonly isPersistent: boolean;
  abstract projectId: string;
  abstract zone: string;
  abstract stationName: string;

  constructor(
    protected readonly pm: IProcessManager,
    protected readonly executors: IExecutors,
  ) {}

  /**
   * Naming Policy Hooks (Standard Hierarchical Defaults)
   */

  resolveWorkspaceName(repoSlug: string, idSlug: string): string {
    // Hierarchical folder path: <repo>/<id>
    return path.join(repoSlug, idSlug);
  }

  resolveSessionName(repoSlug: string, idSlug: string, action: string): string {
    // Hierarchical Tmux name: <repo>/<id>[/<action>]
    const parts = [repoSlug, idSlug];
    if (action !== 'chat') parts.push(action);
    return parts.join('/');
  }

  resolveContainerName(
    repoSlug: string,
    idSlug: string,
    action: string,
  ): string {
    // System-safe handle: <repo>-<id>[-<action>]
    const parts = [repoSlug, idSlug];
    if (action !== 'chat') parts.push(action);
    return parts.join('-');
  }

  /**
   * Resolves the ID used for RAM-disk secrets.
   */
  resolveSecretId(repoSlug: string, idSlug: string, action: string): string {
    return this.resolveContainerName(repoSlug, idSlug, action);
  }

  /**
   * Abstract Hooks: Must be unique per backend environment.
   */

  /**
   * Translates a workspace name into an absolute filesystem path.
   */
  abstract resolveWorkDir(workspaceName: string): string;

  /**
   * Returns the absolute path to the directory containing all mission workspaces.
   */
  abstract resolveWorkspacesRoot(): string;

  /**
   * Returns the absolute path to the Orbit worker (station.js) in this environment.
   */
  abstract resolveWorkerPath(): string;

  /**
   * Returns the absolute path to the project config directory (.gemini) in this environment.
   */
  abstract resolveProjectConfigDir(): string;

  /**
   * Returns the absolute path to the workspace policy file in this environment.
   */
  abstract resolvePolicyPath(repoRoot: string): string;

  /**
   * Returns the absolute path to the git mirror repository in this environment.
   */
  abstract resolveMirrorPath(): string;

  /**
   * Creates a command to run a Node.js script.
   */
  abstract createNodeCommand(scriptPath: string, args?: string[]): Command;

  /**
   * Ensures the backend is ready for mission orchestration.
   */
  abstract ensureReady(): Promise<number>;

  /**
   * Returns the canonical isolation identifier (session/container name) for this environment.
   */
  abstract resolveIsolationId(mCtx: MissionContext): string;

  /**
   * Executes a raw command in the environment.
   */
  abstract getExecOutput(
    command: string | Command,
    options?: ExecOptions,
  ): Promise<{ status: number; stdout: string; stderr: string }>;

  /**
   * Returns the formatted run command for this environment.
   */
  abstract getRunCommand(command: string, options?: ExecOptions): string;

  /**
   * Syncs files between local and remote.
   */
  abstract sync(
    localPath: string,
    remotePath: string,
    options?: SyncOptions,
  ): Promise<number>;

  /**
   * Syncs files only if changed.
   */
  abstract syncIfChanged(
    localPath: string,
    remotePath: string,
    options?: SyncOptions,
  ): Promise<number>;

  /**
   * Returns hardware health and basic identification.
   */
  abstract getStatus(): Promise<OrbitStatus>;

  /**
   * Safe wake of a hibernated station.
   */
  abstract start(): Promise<number>;

  /**
   * Safe stop of Orbit hardware.
   */
  abstract stop(): Promise<number>;

  /**
   * Status of a specific capsule.
   */
  abstract getCapsuleStatus(
    name: string,
  ): Promise<{ running: boolean; exists: boolean }>;

  /**
   * Resource usage stats for a capsule.
   */
  abstract getCapsuleStats(name: string): Promise<string>;

  /**
   * Time since last activity in a capsule.
   */
  abstract getCapsuleIdleTime(name: string): Promise<number>;

  /**
   * Attaches to an active mission.
   */
  abstract attach(name: string): Promise<number>;

  /**
   * Launches a specific capsule configuration.
   */
  abstract runCapsule(config: CapsuleConfig): Promise<number>;

  /**
   * Signal-safe stop of a capsule.
   */
  abstract stopCapsule(name: string): Promise<number>;

  /**
   * Permanent removal of a capsule.
   */
  abstract removeCapsule(name: string): Promise<number>;

  /**
   * Surgical removal of a mission's resources.
   */
  abstract jettisonMission(
    identifier: string,
    action?: string,
  ): Promise<number>;

  /**
   * Decommissions all active missions and optionally their secrets.
   */
  abstract splashdown(options?: {
    all?: boolean;
    clearSecrets?: boolean;
  }): Promise<number>;

  /**
   * Permanent removal of a specific mission secret.
   */
  abstract removeSecret(sessionId: string): Promise<void>;

  /**
   * Real-time terminal capture.
   */
  abstract capturePane(capsuleName: string): Promise<string>;

  /**
   * Lists all Orbit-managed stations (cloud only).
   */
  abstract listStations(): Promise<number>;

  /**
   * Permanent destruction of Orbit hardware.
   */
  abstract destroy(): Promise<number>;

  /**
   * Lists all active capsules on this station.
   */
  abstract listCapsules(): Promise<string[]>;

  /**
   * Provisions a high-performance git mirror.
   */
  abstract provisionMirror(remoteUrl: string): Promise<number>;

  /**
   * Drops into a raw interactive shell on the hardware host.
   */
  abstract stationShell(): Promise<number>;

  /**
   * Drops into a raw interactive shell inside a mission capsule.
   */
  abstract missionShell(capsuleName: string): Promise<number>;

  /**
   * Generates the immutable receipt for this station.
   */
  abstract getStationReceipt(): StationReceipt;

  /**
   * Prepares the workspace for a new mission.
   */
  abstract prepareMissionWorkspace(
    mCtx: MissionContext,
    infra: InfrastructureSpec,
  ): Promise<void>;

  /**
   * Injects dynamic state into the provider.
   */
  injectState?(state: InfrastructureState): void;

  /**
   * Environment-specific fallback for determining capsule state when
   * no manifest is found.
   */
  protected abstract resolveLegacyCapsuleState(
    name: string,
  ): Promise<CapsuleInfo['state']>;

  /**
   * Executes a command within the context of a specific mission.
   * Providers handle environment isolation (e.g. Docker wrap, CWD shift).
   */
  async execMission(
    command: string | Command,
    mCtx: MissionContext,
    options: ExecOptions = {},
  ): Promise<number> {
    const res = await this.getMissionExecOutput(command, mCtx, options);
    return res.status;
  }

  /**
   * Returns output from a command executed within a specific mission.
   */
  async getMissionExecOutput(
    command: string | Command,
    mCtx: MissionContext,
    options: ExecOptions = {},
  ): Promise<{ status: number; stdout: string; stderr: string }> {
    const env = { ...options.env };
    if (options.manifest) {
      env.GCLI_ORBIT_MANIFEST = JSON.stringify(options.manifest);
    }

    return this.getExecOutput(command, {
      ...options,
      env,
      cwd:
        options.cwd ||
        options.manifest?.workDir ||
        this.resolveWorkDir(mCtx.workspaceName),
      isolationId: this.resolveIsolationId(mCtx),
    });
  }

  /**
   * Shell-safe quoting helper.
   */
  shellQuote(val: string): string {
    return `'${val.replace(/'/g, "'\\''")}'`;
  }

  async exec(
    command: string | Command,
    options: ExecOptions = {},
  ): Promise<number> {
    const res = await this.getExecOutput(command, options);
    return res.status;
  }

  /**
   * Resolves the canonical RAM-disk secret path for a session.
   */
  resolveSecretPath(secretId: string): string {
    return `/dev/shm/.orbit-env-${secretId}`;
  }

  /**
   * Fetches deep mission status from inside the station.
   * Centralized logic that uses environment-specific hooks.
   */
  async getMissionTelemetry(peek = false): Promise<CapsuleInfo[]> {
    const capsules: CapsuleInfo[] = [];

    // 1. Request aggregated status from the worker
    const bundlePath = this.resolveWorkerPath();
    const workspacesRoot = this.resolveWorkspacesRoot();

    const statusCmd = this.createNodeCommand(bundlePath, [
      'status',
      workspacesRoot,
    ]);

    const statusOutput = await this.getExecOutput(statusCmd, { quiet: true });

    let aggregatedMissions: any[] = [];
    if (statusOutput.status === 0) {
      try {
        const report = JSON.parse(statusOutput.stdout);
        aggregatedMissions = report.missions || [];
      } catch (_e) {
        // Fallback
      }
    }

    // 2. Discover active capsules/containers
    const containerNames = await this.listCapsules();

    for (const containerName of containerNames) {
      const stats = await this.getCapsuleStats(containerName);
      const missionState = aggregatedMissions.find(
        (m) => m.mission === containerName || containerName.includes(m.mission),
      );

      // 3. Provider-specific state check (Smarter fallback)
      const legacyState = await this.resolveLegacyCapsuleState(containerName);

      if (missionState) {
        // State Hierarchy:
        // 1. If worker explicitly says WAITING_FOR_APPROVAL, trust it (Notification hook)
        // 2. If provider sees an approval prompt in the terminal, upgrade it
        // 3. Otherwise, use worker status unless it says IDLE and provider sees activity
        let finalState = missionState.status as CapsuleInfo['state'];

        if (
          legacyState === 'WAITING_FOR_APPROVAL' ||
          legacyState === 'WAITING_FOR_INPUT'
        ) {
          finalState = legacyState;
        } else if (finalState === 'IDLE' && legacyState !== 'IDLE') {
          finalState = legacyState;
        }

        capsules.push({
          name: containerName,
          state: finalState,
          stats,
          lastThought:
            missionState.last_thought ||
            (peek ? await this.capturePane(containerName) : undefined),
          blocker:
            missionState.blocker ||
            (finalState === 'WAITING_FOR_APPROVAL'
              ? 'Approval needed for tool execution'
              : undefined),
          progress: missionState.progress,
          pendingTool: missionState.pending_tool,
          lastQuestion: missionState.last_question,
        });
      } else {
        capsules.push({
          name: containerName,
          state: legacyState,
          stats,
          lastThought: peek ? await this.capturePane(containerName) : undefined,
          blocker:
            legacyState === 'WAITING_FOR_APPROVAL'
              ? 'Approval needed for tool execution'
              : undefined,
        });
      }
    }

    return capsules;
  }
}

/**
 * Compatibility alias for existing code
 */
export type OrbitProvider = BaseProvider;

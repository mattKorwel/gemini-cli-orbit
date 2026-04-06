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

  abstract ensureReady(): Promise<number>;

  /**
   * Returns the canonical isolation identifier (session/container name) for this environment.
   */
  abstract resolveIsolationId(mCtx: MissionContext): string;

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

  abstract getExecOutput(
    command: string | Command,
    options?: ExecOptions,
  ): Promise<{ status: number; stdout: string; stderr: string }>;

  abstract getRunCommand(command: string, options?: ExecOptions): string;
  abstract sync(
    localPath: string,
    remotePath: string,
    options?: SyncOptions,
  ): Promise<number>;
  abstract syncIfChanged(
    localPath: string,
    remotePath: string,
    options?: SyncOptions,
  ): Promise<number>;
  abstract getStatus(): Promise<OrbitStatus>;

  /**
   * Safe wake of a hibernated station.
   */
  abstract start(): Promise<number>;

  abstract stop(): Promise<number>;
  abstract getCapsuleStatus(
    name: string,
  ): Promise<{ running: boolean; exists: boolean }>;
  abstract getCapsuleStats(name: string): Promise<string>;
  abstract getCapsuleIdleTime(name: string): Promise<number>;
  abstract attach(name: string): Promise<number>;
  abstract runCapsule(config: CapsuleConfig): Promise<number>;
  abstract stopCapsule(name: string): Promise<number>;
  abstract removeCapsule(name: string): Promise<number>;
  abstract jettisonMission(
    identifier: string,
    action?: string,
  ): Promise<number>;
  abstract removeSecret(sessionId: string): Promise<void>;

  /**
   * Resolves the canonical RAM-disk secret path for a session.
   */
  resolveSecretPath(secretId: string): string {
    return `/dev/shm/.orbit-env-${secretId}`;
  }

  abstract capturePane(capsuleName: string): Promise<string>;
  abstract listStations(): Promise<number>;
  abstract destroy(): Promise<number>;
  abstract listCapsules(): Promise<string[]>;
  abstract provisionMirror(remoteUrl: string): Promise<number>;
  abstract stationShell(): Promise<number>;
  abstract missionShell(capsuleName: string): Promise<number>;

  abstract getStationReceipt(): StationReceipt;

  injectState?(state: InfrastructureState): void;

  abstract prepareMissionWorkspace(
    mCtx: MissionContext,
    infra: InfrastructureSpec,
  ): Promise<void>;

  /**
   * Fetches deep mission status from inside the station.
   * Centralized logic that uses environment-specific hooks.
   */
  async getMissionTelemetry(): Promise<CapsuleInfo[]> {
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

      if (missionState) {
        capsules.push({
          name: containerName,
          state: missionState.status,
          stats,
          lastThought: missionState.last_thought,
          blocker: missionState.blocker,
          progress: missionState.progress,
          pendingTool: missionState.pending_tool,
          lastQuestion: missionState.last_question,
        });
      } else {
        // 3. Provider-specific fallback (e.g. Tmux parsing)
        const state = await this.resolveLegacyCapsuleState(containerName);
        capsules.push({
          name: containerName,
          state,
          stats,
        });
      }
    }

    return capsules;
  }

  /**
   * Environment-specific fallback for determining capsule state when
   * no manifest is found.
   */
  protected abstract resolveLegacyCapsuleState(
    name: string,
  ): Promise<CapsuleInfo['state']>;
}

/**
 * Compatibility alias for existing code
 */
export type OrbitProvider = BaseProvider;

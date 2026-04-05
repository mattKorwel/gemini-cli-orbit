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
  abstract readonly isLocal: boolean;
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
   * Abstract Hooks: Must be unique per backend environment.
   */

  /**
   * Translates a workspace name into an absolute filesystem path.
   */
  abstract resolveWorkDir(workspaceName: string): string;

  abstract ensureReady(): Promise<number>;
  abstract exec(
    command: string | Command,
    options?: ExecOptions,
  ): Promise<number>;
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
}

/**
 * Compatibility alias for existing code
 */
export type OrbitProvider = BaseProvider;

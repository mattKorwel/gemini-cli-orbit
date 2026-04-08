/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseProvider } from './BaseProvider.js';
import { StarfleetClient } from '../sdk/StarfleetClient.js';
import {
  type ExecOptions,
  type SyncOptions,
  type OrbitStatus,
  type CapsuleConfig,
  type CapsuleInfo,
} from '../core/types.js';
import { type Command } from '../core/executors/types.js';
import { type MissionContext } from '../utils/MissionUtils.js';
import {
  type IExecutors,
  type IProcessManager,
  type StationReceipt,
} from '../core/interfaces.js';
import {
  ORBIT_ROOT,
  BUNDLE_PATH,
  STATION_BUNDLE_PATH,
} from '../core/Constants.js';

/**
 * StarfleetProvider: A remote-first provider that delegates all actions to
 * the Station Supervisor API.
 */
export class StarfleetProvider extends BaseProvider {
  public readonly type = 'gce'; // Starfleet typically runs on GCE
  public readonly isPersistent = true;

  public projectId: string;
  public zone: string;
  public stationName: string;

  constructor(
    private readonly client: StarfleetClient,
    pm: IProcessManager,
    executors: IExecutors,
    config: {
      projectId: string;
      zone: string;
      stationName: string;
    },
  ) {
    super(pm, executors);
    this.projectId = config.projectId;
    this.zone = config.zone;
    this.stationName = config.stationName;
  }

  // --- Path Resolution (Hardcoded to Starfleet Standards) ---

  resolveWorkDir(workspaceName: string): string {
    return `${ORBIT_ROOT}/workspaces/${workspaceName}`;
  }

  resolveWorkspacesRoot(): string {
    return `${ORBIT_ROOT}/workspaces`;
  }

  resolveBundlePath(): string {
    return BUNDLE_PATH;
  }

  resolveWorkerPath(): string {
    return STATION_BUNDLE_PATH;
  }

  resolveProjectConfigDir(): string {
    return `${ORBIT_ROOT}/project-configs`;
  }

  resolvePolicyPath(): string {
    return `${ORBIT_ROOT}/project-configs/policies/workspace-policy.toml`;
  }

  resolveMirrorPath(): string {
    return `${ORBIT_ROOT}/main`;
  }

  resolveGlobalConfigDir(): string {
    return '/home/node/.gemini';
  }

  // --- Core Lifecycle (API Delegated) ---

  async ensureReady(): Promise<number> {
    const alive = await this.client.ping();
    return alive ? 0 : 1;
  }

  async getExecOutput(command: string | Command, options?: ExecOptions) {
    return this.client.exec(command, options);
  }

  getRunCommand(): string {
    return 'STARFLEET_API_CALL';
  }

  async sync(
    localPath: string,
    remotePath: string,
    options?: SyncOptions,
  ): Promise<number> {
    return 0;
  }

  async syncIfChanged(
    localPath: string,
    remotePath: string,
    options?: SyncOptions,
  ): Promise<number> {
    return 0;
  }

  async getStatus(): Promise<OrbitStatus> {
    const alive = await this.client.ping();
    return {
      name: this.stationName,
      status: alive ? 'RUNNING' : 'UNREACHABLE',
    };
  }

  async start(): Promise<number> {
    return 0;
  }
  async stop(): Promise<number> {
    return 0;
  }

  async getCapsuleStatus(name: string) {
    const capsules = await this.client.listCapsules();
    const exists = capsules.includes(name);
    return { exists, running: exists };
  }

  async getCapsuleStats(): Promise<string> {
    return 'N/A';
  }
  async getCapsuleIdleTime(): Promise<number> {
    return 0;
  }

  async attach(name: string): Promise<number> {
    return 0;
  }

  async runCapsule(config: CapsuleConfig): Promise<number> {
    return 0;
  }

  async stopCapsule(name: string): Promise<number> {
    return 0;
  }
  async removeCapsule(name: string): Promise<number> {
    return 0;
  }

  async jettisonMission(identifier: string): Promise<number> {
    return 0;
  }

  async splashdown(): Promise<number> {
    return 0;
  }
  async removeSecret(): Promise<void> {}

  async capturePane(capsuleName: string): Promise<string> {
    return this.client.capturePane(capsuleName);
  }

  async listStations(): Promise<number> {
    return 0;
  }
  async destroy(): Promise<number> {
    return 0;
  }

  async listCapsules(): Promise<string[]> {
    return this.client.listCapsules();
  }

  async provisionMirror(): Promise<number> {
    return 0;
  }

  async stationShell(): Promise<number> {
    return 0;
  }
  async missionShell(): Promise<number> {
    return 0;
  }

  getStationReceipt(): StationReceipt {
    return {
      name: this.stationName,
      instanceName: this.stationName,
      type: 'gce',
      projectId: this.projectId,
      zone: this.zone,
      repo: 'unknown',
      lastSeen: new Date().toISOString(),
    };
  }

  async prepareMissionWorkspace(mCtx: MissionContext): Promise<void> {}

  protected async resolveLegacyCapsuleState(): Promise<CapsuleInfo['state']> {
    return 'IDLE';
  }

  override resolveIsolationId(mCtx: MissionContext): string {
    return mCtx.containerName;
  }
}

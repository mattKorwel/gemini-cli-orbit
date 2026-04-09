/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseProvider } from './BaseProvider.js';
import { StarfleetClient } from '../sdk/StarfleetClient.js';
import path from 'node:path';
import fs from 'node:fs';
import {
  type OrbitStatus,
  type StationReceipt,
  type MissionManifest,
  type ExecOptions,
  type CapsuleConfig,
  type CapsuleInfo,
  type ExecResult,
  type SyncOptions,
  type OrbitObserver,
} from '../core/types.js';
import { type Command } from '../core/executors/types.js';
import {
  BUNDLE_PATH,
  ORBIT_ROOT,
  STATION_BUNDLE_PATH,
  ORBIT_STATE_PATH,
  type ProjectContext,
  type InfrastructureSpec,
} from '../core/Constants.js';
import {
  type StationTransport,
  type IProcessManager,
  type IExecutors,
} from '../core/interfaces.js';
import { type MissionContext } from '../utils/MissionUtils.js';

/**
 * StarfleetProvider: Abstract base for all providers that delegate to a
 * Station Supervisor API.
 */
export abstract class StarfleetProvider extends BaseProvider {
  public abstract readonly type: 'gce' | 'local-docker';
  public readonly isPersistent = true;

  public projectId: string;
  public zone: string;
  public stationName: string;

  constructor(
    protected readonly client: StarfleetClient,
    protected readonly transport: StationTransport,
    protected readonly pm: IProcessManager,
    executors: IExecutors,
    protected readonly projectCtx: ProjectContext,
    protected readonly infra: InfrastructureSpec,
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

  /**
   * Environment-specific ignition sequence.
   */
  abstract verifyIgnition(observer: OrbitObserver): Promise<boolean>;

  override resolveWorkspaceName(repoSlug: string, idSlug: string): string {
    return `${repoSlug}-${idSlug}`;
  }

  override resolveSessionName(
    repoSlug: string,
    idSlug: string,
    action: string,
  ): string {
    const parts = [repoSlug, idSlug];
    if (action !== 'chat') parts.push(action);
    return parts.join('-');
  }

  override resolveContainerName(
    _repoSlug: string,
    idSlug: string,
    _action: string,
  ): string {
    return `orbit-${idSlug}`;
  }

  // --- Path Resolution (Station Host perspective) ---

  /**
   * Returns the primary root for Orbit data on the station host.
   */
  resolveOrbitRoot(): string {
    return ORBIT_ROOT;
  }

  resolveWorkDir(workspaceName: string): string {
    return path.join(this.resolveWorkspacesRoot(), workspaceName);
  }

  resolveWorkspacesRoot(): string {
    return path.join(this.resolveOrbitRoot(), 'workspaces');
  }

  // --- Path Resolution (Mission Capsule perspective) ---

  /**
   * Returns the primary root for Orbit data inside the capsule.
   */
  resolveCapsuleOrbitRoot(): string {
    return '/mnt/disks/data';
  }

  /**
   * Returns the absolute workspace path inside the capsule.
   */
  resolveCapsuleWorkDir(workspaceName: string): string {
    return path.join(
      this.resolveCapsuleOrbitRoot(),
      'workspaces',
      workspaceName,
    );
  }

  resolveBundlePath(): string {
    return BUNDLE_PATH;
  }

  resolveWorkerPath(): string {
    return STATION_BUNDLE_PATH;
  }

  resolveProjectConfigDir(): string {
    return path.join(this.resolveOrbitRoot(), '.gemini');
  }

  resolvePolicyPath(): string {
    return path.join(
      this.resolveCapsuleOrbitRoot(),
      '.gemini/policies/workspace-policy.toml',
    );
  }

  resolveMirrorPath(): string {
    return path.join(this.resolveOrbitRoot(), 'main');
  }

  resolveGlobalConfigDir(): string {
    return '/home/node/.gemini';
  }

  // --- Core API Layer ---

  async ensureReady(): Promise<number> {
    try {
      // Basic connectivity check
      const ping = await this.transport.exec(
        { bin: 'echo', args: ['pong'] },
        { quiet: true },
      );
      if (ping.status !== 0) return 1;

      // Ensure API tunnel (noop for local)
      await this.transport.ensureTunnel(8080, 8080);

      // Verify API connectivity
      const isAlive = await this.client.ping();
      if (!isAlive) {
        throw new Error('Starfleet API not responding');
      }

      return 0;
    } catch (_err: any) {
      return 1;
    }
  }

  async getExecOutput(command: string | Command, options?: ExecOptions) {
    return this.client.exec(command, options);
  }

  getRunCommand(): string {
    return 'STARFLEET_API_CALL';
  }

  override createNodeCommand(scriptPath: string, args: string[] = []): Command {
    // If we're on GCE, use the baked-in remote path
    if (this.type === 'gce') {
      return this.executors.node.createRemote(scriptPath, args);
    }

    // On local-docker, the scriptPath provided by telemetry is already the local host path
    return {
      bin: process.execPath,
      args: [scriptPath, ...args],
    };
  }

  async sync(
    _localPath: string,
    _remotePath: string,
    _options?: SyncOptions,
  ): Promise<number> {
    return 0;
  }

  async syncIfChanged(
    _localPath: string,
    _remotePath: string,
    _options?: SyncOptions,
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
  async attach(containerName: string, sessionName: string): Promise<number> {
    try {
      await this.ensureReady();
      return await this.transport.attach(containerName, sessionName);
    } catch (_err: any) {
      return 1;
    }
  }
  async runCapsule(_config: CapsuleConfig): Promise<number> {
    return 0;
  }
  async stopCapsule(_name: string): Promise<number> {
    return 0;
  }
  async removeCapsule(_name: string): Promise<number> {
    return 0;
  }
  async jettisonMission(_identifier: string): Promise<number> {
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
    const target = this.transport.getConnectionHandle();
    const res = this.pm.runSync('ssh', ['-t', target], {
      interactive: true,
    });
    return res.status;
  }
  async stationExec(
    command: string | Command,
    options?: ExecOptions,
  ): Promise<ExecResult> {
    return this.transport.exec(command, options);
  }
  async missionShell(): Promise<number> {
    return 0;
  }

  getStationReceipt(): StationReceipt {
    return {
      name: this.stationName,
      instanceName: this.stationName,
      type: this.type,
      projectId: this.projectId,
      zone: this.zone,
      repo: this.projectCtx.repoName,
      upstreamUrl: this.infra.upstreamUrl,
      networkAccessType: this.infra.networkAccessType as any,
      schematic: this.infra.schematic,
      dnsSuffix: this.infra.dnsSuffix,
      userSuffix: this.infra.userSuffix,
      lastSeen: new Date().toISOString(),
    };
  }

  async launchMission(
    manifest: MissionManifest,
    hostWorkDir: string,
  ): Promise<number> {
    try {
      // Sync user context (Auth, Trust, etc.)
      await this.syncGlobalConfig();

      const res = (await this.client.launchMission(manifest)) as any;

      if (res.status === 'ACCEPTED' && res.receipt) {
        console.log(`\n✨ Starfleet Mission Ignited!`);
        console.log(`   ID:        ${res.receipt.missionId}`);
        console.log(`   Capsule:   ${res.receipt.containerName}`);
        console.log(`   Workspace: ${res.receipt.workspacePath}`);
        console.log(`   Time:      ${res.receipt.ignitedAt}`);

        // Wait for worker to signal READY on the host-side path
        const isReady = await this.waitForIgnition(hostWorkDir);
        return isReady ? 0 : 1;
      }
      return 1;
    } catch (_err: any) {
      return 1;
    }
  }

  /**
   * Periodically polls for state.json [IDLE] on the host machine.
   */
  private async waitForIgnition(
    hostWorkDir: string,
    timeoutMs = 15000,
  ): Promise<boolean> {
    const statePath = path.join(hostWorkDir, ORBIT_STATE_PATH);
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        if (fs.existsSync(statePath)) {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (state.status === 'IDLE' || state.status === 'READY') {
            return true;
          }
        }
      } catch (_e) {
        // Retry
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.error(
      `❌ Ignition verification timed out after ${timeoutMs / 1000}s.`,
    );
    console.error(`   Worker failed to signal READY at ${statePath}`);
    return false;
  }

  async prepareMissionWorkspace(_mCtx: MissionContext): Promise<void> {}
  protected async resolveLegacyCapsuleState(): Promise<CapsuleInfo['state']> {
    return 'IDLE';
  }
  override resolveIsolationId(mCtx: MissionContext): string {
    return mCtx.containerName;
  }
}

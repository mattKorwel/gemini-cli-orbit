/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseProvider } from './BaseProvider.js';
import { StarfleetClient } from '../sdk/StarfleetClient.js';
import { LogLevel } from '../core/Logger.js';
import {
  type ExecOptions,
  type SyncOptions,
  type OrbitStatus,
  type CapsuleConfig,
  type CapsuleInfo,
  type MissionManifest,
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
import { type SSHManager } from './SSHManager.js';

/**
 * StarfleetProvider: A remote-first provider that delegates all actions to
 * the Station Supervisor API over an SSH transport.
 */
export class StarfleetProvider extends BaseProvider {
  public readonly type = 'gce';
  public readonly isPersistent = true;

  public projectId: string;
  public zone: string;
  public stationName: string;

  constructor(
    private readonly client: StarfleetClient,
    private readonly ssh: SSHManager,
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

  // --- Path Resolution ---

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

  // --- Core Lifecycle ---

  async ensureReady(): Promise<number> {
    try {
      const ping = await this.ssh.runHostCommand(
        { bin: 'echo', args: ['pong'] },
        { quiet: true },
      );
      return ping.status === 0 ? 0 : 1;
    } catch {
      return 1;
    }
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

  async launchMission(manifest: MissionManifest): Promise<number> {
    const res = await this.client.launchMission(manifest);
    if (res.status === 'ACCEPTED' && res.receipt) {
      console.log(`\n✨ Starfleet Mission Ignited!`);
      console.log(`   ID:        ${res.receipt.missionId}`);
      console.log(`   Capsule:   ${res.receipt.containerName}`);
      console.log(`   Workspace: ${res.receipt.workspacePath}`);
      console.log(`   Time:      ${res.receipt.ignitedAt}`);
      return 0;
    }
    return 1;
  }

  /**
   * Performs deep verification of a Starfleet Station with Interactive UI.
   */
  async verifyIgnition(
    observer: import('../core/types.js').OrbitObserver,
  ): Promise<boolean> {
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000;
    let step = 0;

    const steps = [
      'Establishing SSH transport',
      'Checking data disk mount',
      'Verifying filesystem paths',
      'Checking Docker daemon',
      'Starting Station Supervisor',
      'Connecting to Starfleet API',
    ];

    const updateUI = (message: string, isComplete = false, isError = false) => {
      const icon = isError ? '❌' : isComplete ? '✅' : '⏳';
      const dots = '.'.repeat(Math.max(1, 30 - message.length));
      const line = `   ${icon} ${message} ${dots} ${isComplete ? 'Success' : isError ? 'Failed' : 'Pending'}`;

      if (process.stdout.isTTY) {
        process.stdout.write(`\r\x1b[K${line}`);
        if (isComplete || isError) process.stdout.write('\n');
      } else {
        observer.onLog?.(LogLevel.INFO, 'SETUP', line);
      }
    };

    observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      '🛸 Starfleet Ignition sequence started...',
    );

    while (Date.now() - startTime < timeout) {
      try {
        updateUI(steps[step]);

        // Step 1: SSH
        if (step === 0) {
          const res = await this.ssh.runHostCommand(
            { bin: 'echo', args: ['pong'] },
            { quiet: true },
          );
          if (res.status === 0) {
            updateUI(steps[0], true);
            step = 1;
            continue;
          }
        }

        // Step 2: Disk
        if (step === 1) {
          const res = await this.ssh.runHostCommand(
            { bin: 'df', args: ['-h', '/mnt/disks/data'] },
            { quiet: true },
          );
          if (res.status === 0) {
            updateUI(steps[1], true);
            step = 2;
            continue;
          }
        }

        // Step 3: Paths
        if (step === 2) {
          const res = await this.ssh.runHostCommand(
            { bin: 'ls', args: ['-d', '/mnt/disks/data/workspaces'] },
            { quiet: true },
          );
          if (res.status === 0) {
            updateUI(steps[2], true);
            step = 3;
            continue;
          }
        }

        // Step 4: Docker Daemon Health
        if (step === 3) {
          const res = await this.ssh.runHostCommand(
            { bin: 'sudo', args: ['docker', 'version'] },
            { quiet: true },
          );
          if (res.status === 0) {
            updateUI(steps[3], true);
            step = 4;
            continue;
          }
        }

        // Step 5: Supervisor Container
        if (step === 4) {
          const res = await this.ssh.runHostCommand(
            {
              bin: 'sudo',
              args: [
                'docker',
                'ps',
                '--filter',
                'name=station-supervisor',
                '--format',
                '{{.Status}}',
              ],
            },
            { quiet: true },
          );
          if (res.stdout.includes('Up')) {
            updateUI(steps[4], true);
            step = 5;
            continue;
          }
        }

        // Step 6: API
        if (step === 5) {
          const alive = await this.client.ping();
          if (alive) {
            updateUI(steps[5], true);
            return true;
          } else {
            await this.ssh.ensureTunnel(8080, 8080);
          }
        }
      } catch (e: any) {
        // Silent retry
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    updateUI(steps[step], false, true);
    return false;
  }

  async prepareMissionWorkspace(mCtx: MissionContext): Promise<void> {}
  protected async resolveLegacyCapsuleState(): Promise<CapsuleInfo['state']> {
    return 'IDLE';
  }
  override resolveIsolationId(mCtx: MissionContext): string {
    return mCtx.containerName;
  }
}

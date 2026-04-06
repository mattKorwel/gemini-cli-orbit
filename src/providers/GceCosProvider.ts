/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseProvider } from './BaseProvider.js';
import {
  type ExecOptions,
  type OrbitStatus,
  type CapsuleConfig,
} from '../core/types.js';
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';
import { type SSHManager, type RemoteCommand } from './SSHManager.js';
import { type Command, flattenCommand } from '../core/executors/types.js';
import { RemoteProvisioner } from '../sdk/RemoteProvisioner.js';
import { logger } from '../core/Logger.js';
import {
  type ProjectContext,
  type InfrastructureSpec,
  STATION_BUNDLE_PATH,
  ORBIT_ROOT,
  MAIN_REPO_PATH,
} from '../core/Constants.js';
import { type MissionContext } from '../utils/MissionUtils.js';
import {
  type IExecutors,
  type IProcessManager,
  type StationReceipt,
} from '../core/interfaces.js';

export class ConnectivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectivityError';
  }
}

/**
 * GCE Container-Optimized OS (COS) Execution Provider.
 * Overrides BaseProvider to maintain legacy flat naming structure.
 */
export class GceCosProvider extends BaseProvider {
  public readonly type = 'gce';
  public readonly isPersistent = true;

  public readonly projectId: string;
  public readonly zone: string;
  public readonly stationName: string;

  private readonly instanceName: string;
  private readonly repoRoot: string;
  private readonly imageUri: string;
  private readonly ssh: SSHManager;

  constructor(
    private readonly projectCtx: ProjectContext,
    projectId: string,
    zone: string,
    instanceName: string,
    repoRoot: string,
    ssh: SSHManager,
    pm: IProcessManager,
    executors: IExecutors,
    private readonly infra: InfrastructureSpec,
    config: {
      imageUri?: string;
      stationName?: string;
    } = {},
  ) {
    super(pm, executors);
    logger.debug(
      'FLEET',
      `GceCosProvider infra: ${JSON.stringify(infra, null, 2)}`,
    );
    this.projectId = projectId;
    this.zone = zone;
    this.instanceName = instanceName;
    this.repoRoot = repoRoot;
    this.ssh = ssh;
    this.imageUri =
      config.imageUri ||
      'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';
    this.stationName = config.stationName || instanceName;
  }

  /**
   * Override: GCE uses a flat orbit-repo-id naming scheme (Legacy compatibility)
   */
  override resolveWorkspaceName(repoSlug: string, idSlug: string): string {
    return `orbit-${repoSlug}-${idSlug}`;
  }

  override resolveSessionName(
    repoSlug: string,
    idSlug: string,
    action: string,
  ): string {
    const parts = ['orbit', repoSlug, idSlug];
    if (action !== 'chat') parts.push(action);
    return parts.join('/');
  }

  override resolveContainerName(
    repoSlug: string,
    idSlug: string,
    action: string,
  ): string {
    const base = this.resolveWorkspaceName(repoSlug, idSlug);
    return action === 'chat' ? base : `${base}-${action}`;
  }

  override resolveWorkDir(workspaceName: string): string {
    return `${ORBIT_ROOT}/workspaces/${this.projectCtx.repoName}/${workspaceName}`;
  }

  override resolveWorkerPath(): string {
    return STATION_BUNDLE_PATH;
  }

  override resolveProjectConfigDir(): string {
    return `${ORBIT_ROOT}/project-configs`;
  }

  override resolvePolicyPath(_repoRoot: string): string {
    return `${ORBIT_ROOT}/project-configs/policies/workspace-policy.toml`;
  }

  override resolveMirrorPath(): string {
    return MAIN_REPO_PATH;
  }

  injectState(state: InfrastructureState): void {
    if (state.publicIp) {
      this.ssh.setOverrideHost(state.publicIp);
    }
  }

  async prepareMissionWorkspace(
    mCtx: MissionContext,
    infra: InfrastructureSpec,
  ): Promise<void> {
    const provisioner = new RemoteProvisioner(this.projectCtx, this);
    await provisioner.prepareMissionWorkspace(mCtx, infra);
  }

  async ensureReady(): Promise<number> {
    const repoCheck = await this.getExecOutput(`ls -d ${this.repoRoot}/.git`, {
      quiet: true,
    });
    if (repoCheck.status !== 0) {
      logger.warn(
        'SETUP',
        '   - Main repo mirror missing on host. This may cause mission delays.',
      );
    }

    try {
      const remote = this.ssh.getMagicRemote();
      logger.info(
        `   - Verifying health check (${this.stationName}) at ${remote}...`,
      );

      let check: { exists: boolean; running: boolean } | null = null;
      let lastErr: any = null;

      for (let i = 0; i < 10; i++) {
        try {
          check = await this.getCapsuleStatus(this.instanceName);
          break;
        } catch (err) {
          if (err instanceof ConnectivityError) {
            lastErr = err;
            process.stdout.write('.');
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          throw err;
        }
      }

      if (!check) {
        throw lastErr || new Error('Failed to establish SSH connection.');
      }
      if (lastErr) process.stdout.write('\n');

      if (!check.exists || !check.running) {
        logger.info(
          '   - Supervisor capsule missing or stopped. Refreshing...',
        );
        const refreshCmd = `
            sudo docker pull ${this.imageUri}
            sudo docker rm -f ${this.instanceName} 2>/dev/null || true
            sudo docker run -d --name ${this.instanceName} --restart always --user root \\
              -v /mnt/disks/data:/mnt/disks/data:rw \\
              -v /mnt/disks/data/gemini-cli-config/.gemini:/home/node/.gemini:rw \\
              ${this.imageUri} /bin/bash -c "ln -sfn /mnt/disks/data /home/node/.orbit && while true; do sleep 1000; done"
          `;
        await this.exec(refreshCmd);
      }

      logger.info(`📡 Acquiring station signal (${this.stationName})...`);
      for (let i = 0; i < 30; i++) {
        const status = await this.getCapsuleStatus(this.instanceName);
        if (status.running) {
          if (i > 0) process.stdout.write('\n');
          logger.info(`🎯 Signal lock established.`);
          return 0;
        }
        process.stdout.write('.');
        await new Promise((r) => setTimeout(r, 2000));
      }
      process.stdout.write('\n');
    } catch (err) {
      if (err instanceof ConnectivityError) {
        console.error(`\n❌ Connectivity Error: ${err.message}`);
        return 255;
      }
      throw err;
    }

    logger.error(`❌ Station "${this.stationName}" failed to respond.`);
    return 1;
  }

  override createNodeCommand(scriptPath: string, args: string[] = []): Command {
    return this.executors.node.createRemote(scriptPath, args);
  }

  getRunCommand(): string {
    return 'NOT_IMPLEMENTED_USE_SSH_MANAGER';
  }

  async exec(
    command: string | Command,
    options: ExecOptions = {},
  ): Promise<number> {
    const res = await this.getExecOutput(command, options);
    return res.status;
  }

  override resolveExecutionCapsule(mCtx: MissionContext): string {
    return mCtx.containerName;
  }

  async getExecOutput(
    command: string | Command,
    options: ExecOptions = {},
  ): Promise<{ status: number; stdout: string; stderr: string }> {
    const mergedOptions = {
      ...options,
      ...(typeof command === 'string' ? {} : command.options),
    };

    const cmdObj: RemoteCommand = {
      bin: '/bin/bash',
      args: ['-c', this.shellQuote(flattenCommand(command))],
      env: { ...(mergedOptions.env || {}) },
    };

    if (mergedOptions.cwd) cmdObj.cwd = mergedOptions.cwd;
    if (mergedOptions.user) cmdObj.user = mergedOptions.user;

    if (mergedOptions.wrapCapsule) {
      const capsulePath =
        '/usr/local/share/npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
      cmdObj.env!.PATH = capsulePath;
      return this.ssh.runDockerExec(
        mergedOptions.wrapCapsule,
        cmdObj,
        mergedOptions,
      );
    }

    return this.ssh.runHostCommand(cmdObj, mergedOptions);
  }

  async sync(
    localPath: string,
    remotePath: string,
    options: { delete?: boolean; exclude?: string[]; sudo?: boolean } = {},
  ): Promise<number> {
    return this.ssh.syncPath(localPath, remotePath, options);
  }

  async syncIfChanged(
    localPath: string,
    remotePath: string,
    options: { delete?: boolean; exclude?: string[]; sudo?: boolean } = {},
  ): Promise<number> {
    return this.ssh.syncPathIfChanged(localPath, remotePath, options);
  }

  async getStatus(): Promise<OrbitStatus> {
    const res = this.pm.runSync(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'describe',
        this.instanceName,
        '--project',
        this.projectId,
        '--zone',
        this.zone,
        '--quiet',
        '--format',
        'json(name,status,networkInterfaces[0].networkIP,networkInterfaces[0].accessConfigs[0].natIP)',
      ],
      {
        quiet: true,
        env: { ...process.env, CLOUDSDK_CORE_VERBOSITY: 'error' },
      },
    );

    if (res.status !== 0) {
      return { name: this.instanceName, status: 'NOT_FOUND' };
    }

    const data = JSON.parse(res.stdout.toString());
    let status = data.status;
    if (status === 'TERMINATED') status = 'HIBERNATING';

    return {
      name: data.name,
      status,
      internalIp: data.networkInterfaces[0].networkIP,
      externalIp: data.networkInterfaces[0].accessConfigs?.[0]?.natIP,
    };
  }

  async start(): Promise<number> {
    const res = this.pm.runSync(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'start',
        this.instanceName,
        '--project',
        this.projectId,
        '--zone',
        this.zone,
        '--quiet',
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, CLOUDSDK_CORE_VERBOSITY: 'error' },
      },
    );
    return res.status;
  }

  async stop(): Promise<number> {
    const res = this.pm.runSync(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'stop',
        this.instanceName,
        '--project',
        this.projectId,
        '--zone',
        this.zone,
        '--quiet',
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, CLOUDSDK_CORE_VERBOSITY: 'error' },
      },
    );
    return res.status;
  }

  async getCapsuleStatus(
    name: string,
  ): Promise<{ running: boolean; exists: boolean }> {
    const res = await this.getExecOutput(
      `sudo docker inspect -f '{{.State.Running}}' ${name}`,
      { quiet: true },
    );
    if (res.status === 255) {
      throw new ConnectivityError(res.stderr || 'SSH connection failed');
    }
    if (res.status !== 0) return { running: false, exists: false };
    return { running: res.stdout.trim() === 'true', exists: true };
  }

  async getCapsuleStats(name: string): Promise<string> {
    const res = await this.getExecOutput(
      `sudo docker stats ${name} --no-stream --format '{{.CPUPerc}} / {{.MemUsage}}'`,
      { quiet: true },
    );
    return res.stdout.trim();
  }

  async getCapsuleIdleTime(): Promise<number> {
    return 0;
  }

  async attach(name: string): Promise<number> {
    return this.ssh.attachToTmux(name, name);
  }

  async runCapsule(config: CapsuleConfig): Promise<number> {
    const mounts = config.mounts
      .map(
        (m: { host: string; capsule: string; readonly?: boolean }) =>
          `-v ${m.host}:${m.capsule}${m.readonly ? ':ro' : ':rw'}`,
      )
      .join(' ');

    const envFlags = [
      ...(config.env
        ? Object.entries(config.env).map(
            ([k, v]) => `-e ${k}=${this.shellQuote(v as string)}`,
          )
        : []),
    ].join(' ');

    const limits = `${config.cpuLimit ? `--cpus=${config.cpuLimit}` : ''} ${config.memoryLimit ? `--memory=${config.memoryLimit}` : ''}`;

    const cmd = config.command || 'while true; do sleep 1000; done';
    const dockerCmd = `sudo docker run -d --name ${config.name} --restart always ${config.user ? `--user ${config.user}` : ''} ${limits} ${mounts} ${envFlags} ${config.image} /bin/bash -c ${this.shellQuote(cmd)}`;

    return this.exec(dockerCmd);
  }

  async stopCapsule(name: string): Promise<number> {
    return this.exec(`sudo docker stop ${name}`);
  }

  async removeCapsule(name: string): Promise<number> {
    return this.exec(`sudo docker rm -f ${name}`);
  }

  async capturePane(capsuleName: string): Promise<string> {
    const res = await this.getExecOutput(
      `sudo docker exec ${capsuleName} tmux capture-pane -pt default`,
      { quiet: true },
    );
    return res.stdout;
  }

  async listStations(): Promise<number> {
    const res = this.pm.runSync(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'list',
        '--project',
        this.projectId,
        '--filter',
        'labels.orbit-managed=true',
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, CLOUDSDK_CORE_VERBOSITY: 'error' },
      },
    );
    return res.status;
  }

  async destroy(): Promise<number> {
    const res = this.pm.runSync(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'delete',
        this.instanceName,
        '--project',
        this.projectId,
        '--zone',
        this.zone,
        '--quiet',
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, CLOUDSDK_CORE_VERBOSITY: 'error' },
      },
    );
    return res.status;
  }

  async listCapsules(): Promise<string[]> {
    try {
      const res = await this.getExecOutput(
        "sudo docker ps --format '{{.Names}}' | grep '^orbit-'",
        { quiet: true },
      );
      if (res.status !== 0) {
        // grep returns 1 if no matches found, which is fine
        if (res.status === 1 && !res.stderr) return [];

        throw new Error(
          `Failed to list capsules: ${res.stderr || 'Connection failed'} (exit ${res.status})`,
        );
      }
      return res.stdout.trim().split('\n').filter(Boolean);
    } catch (e: any) {
      logger.debug('FLEET', `Error in listCapsules: ${e.message}`);
      throw e;
    }
  }

  async provisionMirror(remoteUrl: string): Promise<number> {
    const mirrorPath = '/mnt/disks/data/main';
    const check = await this.exec(`ls -d ${mirrorPath}/.git`, { quiet: true });
    if (check === 0) return 0;

    const cmds = [
      `sudo mkdir -p /mnt/disks/data/tmp`,
      `sudo chmod -R 777 /mnt/disks/data`,
      `sudo TMPDIR=/mnt/disks/data/tmp git clone --mirror ${remoteUrl} ${mirrorPath}`,
      `sudo chmod -R 777 ${mirrorPath}`,
    ];

    for (const cmd of cmds) {
      const res = await this.exec(cmd);
      if (res !== 0) return res;
    }
    return 0;
  }

  async stationShell(): Promise<number> {
    return this.exec('/bin/bash', { interactive: true });
  }
  async missionShell(capsuleName: string): Promise<number> {
    return this.exec('/bin/bash', {
      wrapCapsule: capsuleName,
      interactive: true,
      user: 'node',
    });
  }

  getStationReceipt(): StationReceipt {
    return {
      name: this.stationName,
      instanceName: this.instanceName,
      type: 'gce',
      projectId: this.projectId,
      zone: this.zone,
      repo: this.projectCtx.repoName,
      backendType: this.infra.backendType as any,
      schematic: this.infra.schematic,
      dnsSuffix: this.infra.dnsSuffix,
      userSuffix: this.infra.userSuffix,
      lastSeen: new Date().toISOString(),
    };
  }
}

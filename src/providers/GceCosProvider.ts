/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import {
  type OrbitProvider,
  type ExecOptions,
  type OrbitStatus,
  type CapsuleConfig,
} from './BaseProvider.js';
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';
import { GceConnectionManager } from './GceConnectionManager.js';
import { RemoteProvisioner } from '../sdk/RemoteProvisioner.js';
import { logger } from '../core/Logger.js';
import {
  type ProjectContext,
  type InfrastructureSpec,
} from '../core/Constants.js';

export class ConnectivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectivityError';
  }
}

/**
 * GCE Container-Optimized OS (COS) Execution Provider.
 * Focuses strictly on command execution and capsule management.
 * Infrastructure provisioning is handled by InfrastructureProvisioners.
 */
export class GceCosProvider implements OrbitProvider {
  public readonly type = 'gce';
  public readonly isLocal = false;
  projectId: string;

  public zone: string;
  public stationName: string;
  private instanceName: string;
  private repoRoot: string;
  private conn: GceConnectionManager;
  private imageUri: string;

  constructor(
    private readonly projectCtx: ProjectContext,
    projectId: string,
    zone: string,
    instanceName: string,
    repoRoot: string,
    config: {
      dnsSuffix?: string;
      userSuffix?: string;
      backendType?: 'direct-internal' | 'external';
      imageUri?: string;
      stationName?: string;
    } = {},
  ) {
    this.projectId = projectId;
    this.zone = zone;
    this.instanceName = instanceName;
    this.repoRoot = repoRoot;
    this.imageUri =
      config.imageUri ||
      'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';
    this.stationName = config.stationName || instanceName;

    this.conn = new GceConnectionManager(
      this.projectId,
      this.zone,
      this.instanceName,
      {
        ...config,
        instanceName: this.instanceName,
        projectId: this.projectId,
        zone: this.zone,
      } as InfrastructureSpec,
    );
  }

  injectState(state: InfrastructureState): void {
    // In direct-internal mode, we must NOT override the hostname with a direct IP
    // because BeyondCorp SSH relays (gcpnode.com) only accept the full hostname.
    if (this.conn.getBackendType() === 'external') {
      if (state.publicIp) {
        this.conn.setOverrideHost(state.publicIp);
      }
    }
  }

  async prepareMissionWorkspace(
    identifier: string,
    action: string,
    infra: InfrastructureSpec,
  ): Promise<void> {
    const provisioner = new RemoteProvisioner(this.projectCtx, this);
    await provisioner.prepareMissionWorkspace(identifier, action, infra);
  }

  /**
   * Ensures the station is responsive and the supervisor capsule is running.
   */
  async ensureReady(): Promise<number> {
    await this.conn.onProvisioned();

    // Verify main repo existence on host
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
      const remote = (this.conn as any).strategy.getMagicRemote();
      logger.info(
        `   - Verifying health check (${this.stationName}) at ${remote}...`,
      );
      const check = await this.getCapsuleStatus(this.instanceName);

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

  getRunCommand(command: string, options: ExecOptions = {}): string {
    const finalCmd = options.wrapCapsule
      ? `sudo docker exec ${options.interactive ? '-it' : ''} ${options.cwd ? `-w ${options.cwd}` : ''} ${options.wrapCapsule} /bin/bash -c ${this.q(command)}`
      : command;

    return this.conn.getRunCommand(finalCmd, {
      ...(options.interactive !== undefined
        ? { interactive: options.interactive }
        : {}),
    });
  }

  private q(val: string): string {
    return `'${val.replace(/'/g, "'\\''")}'`;
  }

  async exec(command: string, options: ExecOptions = {}): Promise<number> {
    const res = await this.getExecOutput(command, options);
    return res.status;
  }

  async getExecOutput(
    command: string,
    options: ExecOptions = {},
  ): Promise<{ status: number; stdout: string; stderr: string }> {
    const finalCmd = options.wrapCapsule
      ? `sudo docker exec ${options.interactive ? '-it' : ''} ${options.user ? `-u ${options.user}` : ''} ${options.cwd ? `-w ${options.cwd}` : ''} ${options.wrapCapsule} /bin/bash -c ${this.q(command)}`
      : command;

    const res = this.conn.run(finalCmd, {
      ...(options.interactive !== undefined
        ? { interactive: options.interactive }
        : {}),
      ...(options.quiet !== undefined ? { quiet: options.quiet } : {}),
      ...(options.env !== undefined ? { env: options.env } : {}),
    });

    let stdout = res.stdout?.toString() || '';
    const stderr = res.stderr?.toString() || '';

    // Filter out gcloud noise that sometimes leaks into stdout
    stdout = stdout
      .split('\n')
      .filter((line) => {
        const l = line.toLowerCase();
        if (l.includes('existing host keys found')) return false;
        if (l.includes('created [https://www.googleapis.com/')) return false;
        return true;
      })
      .join('\n')
      .trim();

    return {
      status: res.status ?? (res.error ? 1 : 0),
      stdout,
      stderr: stderr.trim(),
    };
  }

  async sync(
    localPath: string,
    remotePath: string,
    options: { delete?: boolean; exclude?: string[]; sudo?: boolean } = {},
  ): Promise<number> {
    return this.conn.sync(localPath, remotePath, options);
  }

  async getStatus(): Promise<OrbitStatus> {
    const res = spawnSync(
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
      { stdio: 'pipe' },
    );

    if (res.status !== 0) {
      return { name: this.instanceName, status: 'NOT_FOUND' };
    }

    const data = JSON.parse(res.stdout.toString());
    return {
      name: data.name,
      status: data.status,
      internalIp: data.networkInterfaces[0].networkIP,
      externalIp: data.networkInterfaces[0].accessConfigs?.[0]?.natIP,
    };
  }

  async stop(): Promise<number> {
    const res = spawnSync(
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
      { stdio: 'inherit' },
    );
    return res.status ?? 1;
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
    return this.exec(
      `sudo docker exec -it ${name} tmux attach -t default || sudo docker exec -it ${name} /bin/bash`,
      {
        interactive: true,
      },
    );
  }

  async runCapsule(config: CapsuleConfig): Promise<number> {
    const mounts = config.mounts
      .map((m) => `-v ${m.host}:${m.capsule}${m.readonly ? ':ro' : ':rw'}`)
      .join(' ');
    const envFlags = config.env
      ? Object.entries(config.env)
          .map(([k, v]) => `-e ${k}=${this.q(v)}`)
          .join(' ')
      : '';
    const sensitiveEnvFlags = config.sensitiveEnv
      ? Object.entries(config.sensitiveEnv)
          .map(([k, v]) => `-e ${k}=${this.q(v)}`)
          .join(' ')
      : '';
    const limits = `${config.cpuLimit ? `--cpus=${config.cpuLimit}` : ''} ${config.memoryLimit ? `--memory=${config.memoryLimit}` : ''}`;

    const cmd = config.command || 'while true; do sleep 1000; done';
    const dockerCmd = `sudo docker run -d --name ${config.name} --restart always ${config.user ? `--user ${config.user}` : ''} ${limits} ${mounts} ${envFlags} ${sensitiveEnvFlags} ${config.image} /bin/bash -c ${this.q(cmd)}`;

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
    const res = spawnSync(
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
      { stdio: 'inherit' },
    );
    return res.status ?? 0;
  }

  async destroy(): Promise<number> {
    const res = spawnSync(
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
      { stdio: 'inherit' },
    );
    return res.status ?? 0;
  }

  async listCapsules(): Promise<string[]> {
    const res = await this.getExecOutput(
      "sudo docker ps --format '{{.Names}}' | grep '^orbit-'",
      { quiet: true },
    );
    return res.stdout.trim().split('\n').filter(Boolean);
  }
}

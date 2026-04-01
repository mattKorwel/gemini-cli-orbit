/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {
  type OrbitProvider,
  type SetupOptions,
  type ExecOptions,
  type OrbitStatus,
  type CapsuleConfig,
} from './BaseProvider.js';
import { GceConnectionManager } from './GceConnectionManager.js';
import { logger } from '../core/Logger.js';
import { TempManager } from '../utils/TempManager.js';
import { SessionManager } from '../utils/SessionManager.js';
import { getRepoConfig } from '../core/ConfigManager.js';

export class ConnectivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectivityError';
  }
}

export class GceCosProvider implements OrbitProvider {
  public readonly type = 'gce';
  public readonly isLocal = false;
  projectId: string;

  public zone: string;
  public stationName: string;
  private instanceName: string;
  private repoRoot: string;
  private knownHostsPath: string;
  private conn: GceConnectionManager;
  private vpcName: string;
  private subnetName: string;
  private machineType: string;
  private reaperIdleLimit: number;
  private imageUri: string;

  constructor(
    projectId: string,
    zone: string,
    instanceName: string,
    repoRoot: string,
    config: {
      dnsSuffix?: string;
      userSuffix?: string;
      backendType?: 'direct-internal' | 'external';
      imageUri?: string;
      vpcName?: string;
      subnetName?: string;
      machineType?: string;
      reaperIdleLimit?: number;
      stationName?: string;
    } = {},
  ) {
    this.projectId = projectId;
    this.zone = zone;
    this.instanceName = instanceName;
    this.repoRoot = repoRoot;
    this.vpcName = config.vpcName || 'default';
    this.subnetName = config.subnetName || 'default';
    this.machineType = config.machineType || 'n2-standard-8';
    this.reaperIdleLimit = config.reaperIdleLimit || 4;
    this.imageUri =
      config.imageUri ||
      'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';
    this.stationName = config.stationName || instanceName;

    // The Instance Name is the literal hostname used for gcloud/SSH
    this.instanceName = instanceName;

    this.conn = new GceConnectionManager(
      this.projectId,
      this.zone,
      this.instanceName,
      {
        backendType: config.backendType,
        dnsSuffix: config.dnsSuffix,
        userSuffix: config.userSuffix,
      } as any,
    );

    this.knownHostsPath = path.join(
      process.env.HOME || '',
      '.ssh',
      'known_hosts',
    );
  }

  async provision(
    options: {
      setupNetwork?: boolean;
      skipInstanceCreation?: boolean;
      sessionId?: string;
      upstreamUrl?: string;
      repoRoot?: string;
    } = {},
  ): Promise<number> {
    const region = this.zone.split('-').slice(0, 2).join('-');

    if (options.setupNetwork) {
      if (this.vpcName === 'default' && this.subnetName === 'default') {
        logger.info(
          'SETUP',
          `ℹ️  Using existing "default" network. Skipping infrastructure management.`,
        );
      } else {
        logger.info(
          'SETUP',
          `🏗️  Ensuring Network Infrastructure (${this.vpcName})...`,
        );

        // 1. VPC
        const vpcCheck = spawnSync(
          'gcloud',
          [
            '--verbosity=error',
            'compute',
            'networks',
            'describe',
            this.vpcName,
            '--project',
            this.projectId,
          ],
          { stdio: 'pipe' },
        );
        if (vpcCheck.status !== 0) {
          spawnSync(
            'gcloud',
            [
              '--verbosity=error',
              'compute',
              'networks',
              'create',
              this.vpcName,
              '--project',
              this.projectId,
              '--subnet-mode=custom',
            ],
            { stdio: 'inherit' },
          );
        }

        // 2. Subnet
        const subnetCheck = spawnSync(
          'gcloud',
          [
            '--verbosity=error',
            'compute',
            'networks',
            'subnets',
            'describe',
            this.subnetName,
            '--project',
            this.projectId,
            '--region',
            region,
          ],
          { stdio: 'pipe' },
        );
        if (subnetCheck.status !== 0) {
          spawnSync(
            'gcloud',
            [
              '--verbosity=error',
              'compute',
              'networks',
              'subnets',
              'create',
              this.subnetName,
              '--project',
              this.projectId,
              '--network',
              this.vpcName,
              '--region',
              region,
              '--range=10.0.0.0/24',
              '--enable-private-ip-google-access',
            ],
            { stdio: 'inherit' },
          );
        }

        // 3. Delegate specific firewall rules to strategy via manager
        this.conn.setupNetworkInfrastructure(this.vpcName);

        // 4. Cloud NAT (Standard on Orbit for Internet Access)
        const routerName = `${this.vpcName}-router`;
        const natName = `${this.vpcName}-nat`;

        const routerCheck = spawnSync(
          'gcloud',
          [
            '--verbosity=error',
            'compute',
            'routers',
            'describe',
            routerName,
            '--project',
            this.projectId,
            '--region',
            region,
          ],
          { stdio: 'pipe' },
        );
        if (routerCheck.status !== 0) {
          logger.info(
            '   - Ensuring Cloud NAT for internet access in ' + region + '...',
          );
          spawnSync(
            'gcloud',
            [
              '--verbosity=error',
              'compute',
              'routers',
              'create',
              routerName,
              '--project',
              this.projectId,
              '--region',
              region,
              '--network',
              this.vpcName,
            ],
            { stdio: 'inherit' },
          );
          spawnSync(
            'gcloud',
            [
              '--verbosity=error',
              'compute',
              'routers',
              'nats',
              'create',
              natName,
              '--project',
              this.projectId,
              '--region',
              region,
              '--router',
              routerName,
              '--auto-allocate-nat-external-ip',
              '--nat-all-subnet-ip-ranges',
            ],
            { stdio: 'inherit' },
          );
        }

        logger.info('   - Waiting for network propagation (Cloud NAT, etc)...');
        spawnSync('sleep', ['10']);
      }
    }

    if (options.skipInstanceCreation) {
      return 0;
    }

    logger.info(
      `🚀 Provisioning Station: ${this.stationName} (${this.instanceName})...`,
    );

    const startupScriptContent = `#!/bin/bash
      set -e
      echo "🚀 Initializing Unified Orbit..."
      mkdir -p /mnt/disks/data
      if ! mountpoint -q /mnt/disks/data; then
        DATA_DISK="/dev/disk/by-id/google-google-data"
        [ -e "$DATA_DISK" ] || DATA_DISK="/dev/sda"
        while [ ! -e "$DATA_DISK" ]; do sleep 1; done
        blkid "$DATA_DISK" || mkfs.ext4 -m 0 -F "$DATA_DISK"
        mount -o discard,defaults "$DATA_DISK" /mnt/disks/data
      fi
      mkdir -p /mnt/disks/data/main /mnt/disks/data/worktrees /mnt/disks/data/scripts /mnt/disks/data/policies /mnt/disks/data/gemini-cli-config/.gemini
      chown -R 1000:1000 /mnt/disks/data
      chmod -R 770 /mnt/disks/data
      mkdir -p /home/node
      ln -sfn /mnt/disks/data /home/node/.orbit
      chown -R 1000:1000 /home/node

      until docker info >/dev/null 2>&1; do sleep 2; done
      docker pull ${this.imageUri}

      # Sync main repo if requested
      UPSTREAM_URL="${options.upstreamUrl || ''}"
      REPO_ROOT_DIR="${options.repoRoot || ''}"
      if [ -n "$UPSTREAM_URL" ] && [ -n "$REPO_ROOT_DIR" ]; then
        if [ ! -d "$REPO_ROOT_DIR/.git" ]; then
          mkdir -p $(dirname $REPO_ROOT_DIR)
          git clone --quiet $UPSTREAM_URL $REPO_ROOT_DIR || true
        fi
      fi

      if ! docker ps -a | grep -q "${this.instanceName}"; then
        docker run -d --name ${this.instanceName} --restart always --user root \\
          -v /mnt/disks/data:/mnt/disks/data:rw \\
          -v /mnt/disks/data/gemini-cli-config/.gemini:/home/node/.gemini:rw \\
          ${this.imageUri} /bin/bash -c "ln -sfn /mnt/disks/data /home/node/.orbit && while true; do sleep 1000; done"
      fi
    `;

    const config = getRepoConfig();
    const tempManager = new TempManager(config);
    const sessionId =
      options.sessionId ||
      SessionManager.generateSessionId('station', 'provision');
    const sessionDir = tempManager.getDir(sessionId);
    const tmpScriptPath = path.join(sessionDir, 'startup.sh');

    fs.writeFileSync(tmpScriptPath, startupScriptContent);

    const networkArgs = this.conn.getNetworkInterfaceArgs(
      this.vpcName,
      this.subnetName,
    );

    const result = spawnSync(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'create',
        this.instanceName,
        '--project',
        this.projectId,
        '--zone',
        this.zone,
        '--machine-type',
        this.machineType,
        '--image-family',
        'cos-stable',
        '--image-project',
        'cos-cloud',
        '--boot-disk-size',
        '10GB',
        '--boot-disk-type',
        'pd-balanced',
        '--create-disk',
        `name=${this.instanceName}-data,size=200,type=pd-balanced,device-name=google-data,auto-delete=yes,mode=rw`,
        '--metadata-from-file',
        `startup-script=${tmpScriptPath}`,
        '--metadata',
        'enable-oslogin=TRUE',
        ...networkArgs,
        '--scopes',
        'https://www.googleapis.com/auth/cloud-platform',
        '--quiet',
      ],
      { stdio: 'inherit' },
    );

    tempManager.cleanup(sessionId);
    if (result.status === 0) {
      logger.info(
        '⏳ Waiting for OS Login and SSH to initialize (this takes ~45s)...',
      );
      await new Promise((r) => setTimeout(r, 45000));
      await this.conn.onProvisioned();
    }
    return result.status ?? 1;
  }

  async ensureReady(): Promise<number> {
    const status = await this.getStatus();
    const config = getRepoConfig();
    const upstreamUrl = `https://github.com/${config.upstreamRepo}.git`;

    if (status.status === 'NOT_FOUND') {
      logger.info(
        `📡 Station ${this.stationName} not found in cloud. Re-provisioning...`,
      );
      const provRes = await this.provision({
        setupNetwork: false,
        upstreamUrl,
        repoRoot: this.repoRoot,
      });
      if (provRes !== 0) return provRes;
    } else if (status.status !== 'RUNNING') {
      logger.info(
        `📡 Station ${this.stationName} is ${status.status}. Waking it up...`,
      );
      const res = spawnSync(
        'gcloud',
        [
          'compute',
          'instances',
          'start',
          this.instanceName,
          '--project',
          this.projectId,
          '--zone',
          this.zone,
        ],
        { stdio: 'inherit' },
      );
      if (res.status !== 0) {
        logger.info('   - Wake failed. Attempting full re-provision...');
        return this.provision({
          setupNetwork: false,
          upstreamUrl,
          repoRoot: this.repoRoot,
        });
      }
      await new Promise((r) => setTimeout(r, 20000));
    }

    await this.conn.onProvisioned();

    // Verify main repo existence on host
    const repoCheck = await this.getExecOutput(`ls -d ${this.repoRoot}/.git`, {
      quiet: true,
    });
    if (repoCheck.status !== 0) {
      logger.info('   - Main repo mirror missing. Syncing infrastructure...');
      return this.provision({
        skipInstanceCreation: true,
        upstreamUrl,
        repoRoot: this.repoRoot,
      });
    }

    try {
      logger.info(`   - Verifying health check (${this.stationName})...`);
      const check = await this.getCapsuleStatus(this.instanceName);

      if (!check.exists || !check.running) {
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
        if (err.message.includes('SSO') || err.message.includes('login')) {
          console.error(
            '👉 Your connection is not authorized. Please refresh your cloud session and try again.\n',
          );
        } else {
          console.error(
            '👉 Check your network connection and Cloud project.\n',
          );
        }
        return 255;
      }
      throw err;
    }

    logger.error(`❌ Station "${this.stationName}" failed to initialize.`);
    const logs = await this.getExecOutput(
      `sudo docker logs ${this.instanceName}`,
      {
        quiet: true,
      },
    );
    if (logs.stdout.trim() || logs.stderr.trim()) {
      console.error('\n--- CONTAINER LOGS ---');
      console.error(logs.stdout.trim() || logs.stderr.trim());
      console.error('----------------------\n');
    } else {
      console.error(
        `\n⚠️  Unable to fetch container logs. (Exit Code: ${logs.status})`,
      );
      if (logs.stderr) {
        console.error(`Error: ${logs.stderr.trim()}`);
      }
      console.error(
        'Check your GCP connection and ensure the Docker daemon is healthy.\n',
      );
    }

    return 1;
  }

  async setup(_options: SetupOptions): Promise<number> {
    logger.info('📡 Establishing mission uplink...');
    await this.conn.onProvisioned();
    return 0;
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
    return this.exec(`sudo docker exec -it ${name} tmux attach -t default || sudo docker exec -it ${name} /bin/bash`, {
      interactive: true,
    });
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
      "sudo docker ps --format '{{.Names}}' | grep '^gcli-'",
      { quiet: true },
    );
    return res.stdout.trim().split('\n').filter(Boolean);
  }
}

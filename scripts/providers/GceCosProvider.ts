/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  type OrbitProvider,
  type SetupOptions,
  type ExecOptions,
  type SyncOptions,
  type OrbitStatus,
  type CapsuleConfig,
} from './BaseProvider.js';
import { GceConnectionManager } from './GceConnectionManager.js';
import { DEFAULT_IMAGE_URI } from '../Constants.js';
import { logger } from '../Logger.js';


export class GceCosProvider implements OrbitProvider {
  public projectId: string;
  public zone: string;
  public stationName: string;
  private instanceName: string;
  private knownHostsPath: string;
  private conn: GceConnectionManager;
  private imageUri: string;
  private vpcName: string;
  private subnetName: string;
  private machineType: string;

  constructor(
    projectId: string,
    zone: string,
    instanceName: string,
    repoRoot: string,
    config: { dnsSuffix?: string | undefined, userSuffix?: string | undefined, backendType?: string | undefined, imageUri?: string | undefined, vpcName?: string | undefined, subnetName?: string | undefined, stationName?: string | undefined, machineType?: string | undefined } = {}
  ) {
    this.projectId = projectId;
    this.zone = zone;
    this.stationName = config.stationName || 'station-supervisor';
    this.instanceName = instanceName;
    const orbitDir = path.join(repoRoot, '.gemini/orbit');
    if (!fs.existsSync(orbitDir))
      fs.mkdirSync(orbitDir, { recursive: true });
    this.knownHostsPath = path.join(orbitDir, 'known_hosts');
    this.conn = new GceConnectionManager(projectId, zone, instanceName, config, repoRoot);
    this.imageUri = config.imageUri || DEFAULT_IMAGE_URI;
    this.vpcName = config.vpcName || 'default';
    this.subnetName = config.subnetName || 'default';
    this.machineType = config.machineType || 'n2-standard-8';
  }

  async provision(options: { setupNetwork?: boolean, skipInstanceCreation?: boolean } = {}): Promise<number> {
    const imageUri = this.imageUri;
    const region = this.zone.split('-').slice(0, 2).join('-');

    logger.info(`🚀 Preparing infrastructure in ${this.projectId}...`);

    if (options.setupNetwork) {
        logger.info(`🏗️  Ensuring Network Infrastructure (${this.vpcName})...`);
        const vpcCheck = spawnSync('gcloud', ['compute', 'networks', 'describe', this.vpcName, '--project', this.projectId], { stdio: 'inherit' });
        logger.logOutput(vpcCheck.stdout, vpcCheck.stderr);
        if (vpcCheck.status !== 0) {
          spawnSync('gcloud', ['compute', 'networks', 'create', this.vpcName, '--project', this.projectId, '--subnet-mode=custom'], { stdio: 'inherit' });
        }

        const subnetCheck = spawnSync('gcloud', ['compute', 'networks', 'subnets', 'describe', this.subnetName, '--project', this.projectId, '--region', region], { stdio: 'inherit' });
        logger.logOutput(subnetCheck.stdout, subnetCheck.stderr);
        if (subnetCheck.status !== 0) {
          spawnSync('gcloud', ['compute', 'networks', 'subnets', 'create', this.subnetName, '--project', this.projectId, '--network', this.vpcName, '--region', region, '--range=10.0.0.0/24', '--enable-private-ip-google-access'], { stdio: 'inherit' });
        }

        // Delegate backend-specific firewall rules to the strategy
        this.conn.setupNetworkInfrastructure(this.vpcName);

        logger.info('   - Waiting for network propagation (Cloud NAT, etc)...');
        spawnSync('sleep', ['30']);
    }

    if (options.skipInstanceCreation) {
        return 0;
    }

    logger.info(`🚀 Provisioning GCE COS station: ${this.instanceName}...`);

    const startupScriptContent = `#!/bin/bash
      set -e
      echo "🚀 Initializing Unified Orbit..."
      mkdir -p /mnt/disks/data
      if ! mountpoint -q /mnt/disks/data; then
        DATA_DISK="/dev/disk/by-id/google-data"
        [ -e "$DATA_DISK" ] || DATA_DISK="/dev/sdb"
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
      docker pull ${imageUri}
      if ! docker ps -a | grep -q "${this.stationName}"; then
        docker run -d --name ${this.stationName} --restart always --user root \\
          -v /mnt/disks/data:/mnt/disks/data:rw \\
          -v /mnt/disks/data/gemini-cli-config/.gemini:/home/node/.gemini:rw \\
          ${imageUri} /bin/bash -c "ln -sfn /mnt/disks/data /home/node/.orbit && while true; do sleep 1000; done"
      fi
    `;

    const tmpScriptPath = path.join(os.tmpdir(), `gcli-startup-${Date.now()}.sh`);
    fs.writeFileSync(tmpScriptPath, startupScriptContent);

    // Delegate network-interface string to the strategy
    const networkInterface = this.conn.getNetworkInterfaceConfig(this.vpcName, this.subnetName);

    const result = spawnSync('gcloud', [
        'compute', 'instances', 'create', this.instanceName,
        '--project', this.projectId,
        '--zone', this.zone,
        '--machine-type', this.machineType,
        '--image-family', 'cos-stable',
        '--image-project', 'cos-cloud',
        '--boot-disk-size', '20GB',
        '--boot-disk-type', 'pd-balanced',
        '--create-disk', `name=${this.instanceName}-data,size=200,type=pd-balanced,device-name=google-data,auto-delete=yes`,
        '--metadata-from-file', `startup-script=${tmpScriptPath}`,
        '--metadata', 'enable-oslogin=TRUE',
        '--network-interface', networkInterface,
        '--scopes', 'https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring.write,https://www.googleapis.com/auth/devstorage.read_only,https://www.googleapis.com/auth/servicecontrol,https://www.googleapis.com/auth/serviceaccounts.get',
        '--quiet',
    ], { stdio: 'inherit' });
    logger.logOutput(result.stdout, result.stderr);

    fs.unlinkSync(tmpScriptPath);
    if (result.status === 0) {
      logger.info('⏳ Waiting for OS Login and SSH to initialize (this takes ~45s)...');
      await new Promise((r) => setTimeout(r, 45000));
      // Give strategy a chance to update overrideHost (e.g. for external IP)
      await this.conn.onProvisioned();
    }
    return result.status ?? 1;
  }

  async ensureReady(): Promise<number> {
    const status = await this.getStatus();
    if (status.status !== 'RUNNING') {
      logger.info(`⚠️ Station ${this.instanceName} is ${status.status}. Waking it up...`);
      const res = spawnSync('gcloud', ['compute', 'instances', 'start', this.instanceName, '--project', this.projectId, '--zone', this.zone], { stdio: 'inherit' });
      logger.logOutput(res.stdout, res.stderr);
      if (res.status !== 0) return res.status ?? 1;
      await new Promise((r) => setTimeout(r, 20000));
    }

    // CRITICAL: Ensure the connection strategy has the correct IP/hostname resolved
    // BEFORE we attempt any docker/remote commands.
    await this.conn.onProvisioned();

    logger.info('   - Verifying station supervisor health...');
    const check = await this.getCapsuleStatus(this.stationName);
    
    // During development/refactor, we often want to force-refresh the capsule 
    // to pick up new image layers (like the chunk fix).
    const isRefactorImage = this.imageUri.includes('mk-station-refactor');
    
    if (!check.exists || !check.running || isRefactorImage) {
        logger.info(`   ⚠️ Supervisor stale or refactor image detected. Refreshing ${this.imageUri}...`);
        
        // Use the startup script logic but execute it directly via SSH for immediate effect
        const refreshCmd = `
          sudo docker pull ${this.imageUri}
          sudo docker rm -f ${this.stationName} || true
          sudo docker run -d --name ${this.stationName} --restart always --user root \\
            -v /mnt/disks/data:/mnt/disks/data:rw \\
            -v /mnt/disks/data/gemini-cli-config/.gemini:/home/node/.gemini:rw \\
            ${this.imageUri} /bin/bash -c "ln -sfn /mnt/disks/data /home/node/.orbit && while true; do sleep 1000; done"
        `;
        await this.exec(refreshCmd);
    }

    logger.info(`⏳ Waiting for ${this.stationName} to stabilize...`);
    for (let i = 0; i < 30; i++) {
        const status = await this.getCapsuleStatus(this.stationName);
        if (status.running) return 0;
        await new Promise(r => setTimeout(r, 2000));
    }
    return 1;
  }

  async setup(_options: SetupOptions): Promise<number> {
    logger.info(`   - Verifying connection...`);
    // ensure strategy has current IP if needed
    await this.conn.onProvisioned();

    let res = this.conn.run('echo 1');
    if (res.status !== 0) {
      const status = await this.getStatus();
      if (status.internalIp) {
          logger.info(`   ⚠️ Direct connection failed. Falling back to internal IP: ${status.internalIp}`);
          this.conn.setOverrideHost(status.internalIp);
          res = this.conn.run('echo 1');
      }
    }
    if (res.status !== 0) return 1;
    logger.info('   ✅ Connection verified.');
    return 0;
  }

  getRunCommand(command: string, options: ExecOptions = {}): string {
    let finalCmd = command;
    if (options.wrapCapsule) {
      const envFlags = options.env ? Object.entries(options.env).map(([k, v]) => `-e ${k}=${this.quote(v)}`).join(' ') : '';
      // We source secrets.env if it exists (placed there by runCapsule)
      const wrappedCmd = `[ -f /home/node/.orbit/secrets.env ] && . /home/node/.orbit/secrets.env; ${command}`;
      finalCmd = `sudo docker exec ${options.interactive ? '-it' : ''} ${options.cwd ? `-w ${options.cwd}` : ''} ${envFlags} ${options.wrapCapsule} sh -c ${this.quote(wrappedCmd)}`;
    }
    return this.conn.getRunCommand(finalCmd, { interactive: options.interactive });
  }

  async exec(command: string, options: ExecOptions = {}): Promise<number> {
    const res = await this.getExecOutput(command, options);
    return res.status;
  }

  async getExecOutput(command: string, options: ExecOptions = {}): Promise<{ status: number; stdout: string; stderr: string }> {
    let finalCmd = command;
    if (options.wrapCapsule) {
      const envFlags = options.env ? Object.entries(options.env).map(([k, v]) => `-e ${k}=${this.quote(v)}`).join(' ') : '';
      const wrappedCmd = `[ -f /home/node/.orbit/secrets.env ] && . /home/node/.orbit/secrets.env; ${command}`;
      finalCmd = `sudo docker exec ${options.interactive ? '-it' : ''} ${options.cwd ? `-w ${options.cwd}` : ''} ${envFlags} ${options.wrapCapsule} sh -c ${this.quote(wrappedCmd)}`;
    }
    return this.conn.run(finalCmd, { interactive: options.interactive, stdio: options.interactive ? 'inherit' : 'pipe', quiet: options.quiet });
  }

  async sync(localPath: string, remotePath: string, options: SyncOptions = {}): Promise<number> {
    logger.info(`📦 Syncing ${localPath} to station:${remotePath}...`);
    return this.conn.sync(localPath, remotePath, options);
  }

  async getStatus(): Promise<OrbitStatus> {
    const res = spawnSync('gcloud', ['compute', 'instances', 'describe', this.instanceName, '--project', this.projectId, '--zone', this.zone, '--format', 'json(name,status,networkInterfaces[0].networkIP,networkInterfaces[0].accessConfigs[0].natIP)'], { stdio: 'pipe' });
    logger.logOutput(res.stdout, res.stderr);
    if (res.status !== 0) return { name: this.instanceName, status: 'NOT_FOUND' };
    try {
      const data = JSON.parse(res.stdout.toString());
      return { 
        name: data.name, 
        status: data.status, 
        internalIp: data.networkInterfaces?.[0]?.networkIP, 
        externalIp: data.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP 
      };
    } catch { return { name: this.instanceName, status: 'NOT_FOUND' }; }
  }

  async stop(): Promise<number> {
    const res = spawnSync('gcloud', ['compute', 'instances', 'stop', this.instanceName, '--project', this.projectId, '--zone', this.zone], { stdio: 'inherit' });
    logger.logOutput(res.stdout, res.stderr);
    return res.status ?? 1;
  }

  async getCapsuleStatus(name: string): Promise<{ running: boolean; exists: boolean }> {
    const res = await this.getExecOutput(`sudo docker inspect -f '{{.State.Running}}' ${name}`, { quiet: true });
    if (res.status !== 0) return { running: false, exists: false };
    return { running: res.stdout.trim() === 'true', exists: true };
  }

  async runCapsule(config: CapsuleConfig): Promise<number> {
    const mountFlags = config.mounts.map(m => `-v ${m.host}:${m.capsule}${m.readonly ? ':ro' : ':rw'}`).join(' ');
    const envFlags = config.env ? Object.entries(config.env).map(([k, v]) => `-e ${k}=${this.quote(v)}`).join(' ') : '';
    
    let sensitiveFlags = '';
    let sensitiveMount = '';
    if (config.sensitiveEnv && Object.keys(config.sensitiveEnv).length > 0) {
        const envContent = Object.entries(config.sensitiveEnv).map(([k, v]) => `${k}=${v}`).join('\n');
        const envFilePath = `/dev/shm/.gcli-env-${config.name}`;
        await this.exec(`echo ${this.quote(envContent)} > ${envFilePath} && chmod 600 ${envFilePath}`);
        sensitiveFlags = `--env-file ${envFilePath}`;
        sensitiveMount = `-v ${envFilePath}:/home/node/.orbit/secrets.env:ro`;
    }

    const limits = `${config.cpuLimit ? `--cpus=${config.cpuLimit}` : ''} ${config.memoryLimit ? `--memory=${config.memoryLimit}` : ''}`;
    const dockerCmd = `sudo docker run -d --name ${config.name} --restart always ${config.user ? `--user ${config.user}` : ''} ${limits} ${mountFlags} ${sensitiveMount} ${envFlags} ${sensitiveFlags} ${config.image} ${config.command || ''}`;
    return this.exec(dockerCmd);
  }

  async removeCapsule(name: string): Promise<number> {
    await this.exec(`rm -f /dev/shm/.gcli-env-${name} || true`);
    return this.exec(`sudo docker rm -f ${name} || true`);
  }

  async capturePane(capsuleName: string): Promise<string> {
    const res = await this.getExecOutput('tmux capture-pane -pt $(tmux list-sessions -F "#S" | head -n 1) 2>/dev/null', { wrapCapsule: capsuleName, quiet: true });
    return res.stdout;
  }

  async listStations(): Promise<number> {
    const user = process.env.USER || 'gcli-user';
    const instancePrefix = `gcli-station-${user}`;
    logger.info(`🔍 Listing Orbit Stations for ${user} in ${this.projectId}...`);

    const res = spawnSync(
      'gcloud',
      [
        'compute', 'instances', 'list',
        '--project', this.projectId,
        '--filter', `name~^${instancePrefix}`,
        '--format', 'table(name,zone,status,networkInterfaces[0].networkIP:label=INTERNAL_IP,creationTimestamp)',
      ],
      { stdio: 'inherit' },
    );
    logger.logOutput(res.stdout, res.stderr);
    return res.status ?? 0;
  }

  async destroy(): Promise<number> {
    logger.info(`🔥 DESTROYING station ${this.instanceName} and its data disk...`);
    
    // Delete instance
    const res1 = spawnSync(
      'gcloud',
      [
        'compute', 'instances', 'delete', this.instanceName,
        '--project', this.projectId,
        '--zone', this.zone,
        '--quiet',
      ],
      { stdio: 'inherit' },
    );
    logger.logOutput(res1.stdout, res1.stderr);

    // Delete static IP if it exists
    const region = this.zone.split('-').slice(0, 2).join('-');
    const _res2 = spawnSync(
      'gcloud',
      [
        'compute', 'addresses', 'delete', `${this.instanceName}-ip`,
        '--project', this.projectId,
        '--region', region,
        '--quiet',
      ],
      { stdio: 'pipe' },
    );
    logger.logOutput(_res2.stdout, _res2.stderr);
    return (res1.status === 0 || res1.status === null) ? 0 : 1;
  }

  async listCapsules(): Promise<string[]> {
      const res = await this.getExecOutput("sudo docker ps --format '{{.Names}}' | grep '^gcli-'", { quiet: true });
      if (res.status === 0 && res.stdout.trim()) {
          return res.stdout.trim().split('\n');
      }
      return [];
  }

  private quote(str: string) { return `'${str.replace(/'/g, "'\\''")}'`; }
}

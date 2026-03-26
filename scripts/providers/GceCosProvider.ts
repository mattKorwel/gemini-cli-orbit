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
  type WorkerProvider,
  type SetupOptions,
  type ExecOptions,
  type SyncOptions,
  type WorkspaceStatus,
  type ContainerConfig,
} from './BaseProvider.ts';
import { GceConnectionManager } from './GceConnectionManager.ts';

const WORKSPACES_ROOT = '/mnt/disks/data';
const MAIN_REPO_PATH = `${WORKSPACES_ROOT}/main`;
const WORKTREES_PATH = `${WORKSPACES_ROOT}/worktrees`;
const POLICIES_PATH = `${WORKSPACES_ROOT}/policies`;
const SCRIPTS_PATH = `${WORKSPACES_ROOT}/scripts`;
const CONFIG_DIR = `${WORKSPACES_ROOT}/gemini-cli-config/.gemini`;
const EXTENSION_REMOTE_PATH = `${WORKSPACES_ROOT}/extension`;

export class GceCosProvider implements WorkerProvider {
  public projectId: string;
  public zone: string;
  public workerName: string;
  private instanceName: string;
  private knownHostsPath: string;
  private conn: GceConnectionManager;
  private imageUri: string;
  private vpcName: string;
  private subnetName: string;

  constructor(
    projectId: string,
    zone: string,
    instanceName: string,
    repoRoot: string,
    config: { dnsSuffix?: string, userSuffix?: string, backendType?: string, imageUri?: string, vpcName?: string, subnetName?: string, workerName?: string } = {}
  ) {
    this.projectId = projectId;
    this.zone = zone;
    this.workerName = config.workerName || 'development-worker';
    this.instanceName = instanceName;
    const workspacesDir = path.join(repoRoot, '.gemini/workspaces');
    if (!fs.existsSync(workspacesDir))
      fs.mkdirSync(workspacesDir, { recursive: true });
    this.knownHostsPath = path.join(workspacesDir, 'known_hosts');
    this.conn = new GceConnectionManager(projectId, zone, instanceName, config, repoRoot);
    this.imageUri = config.imageUri || 'us-docker.pkg.dev/gemini-code-dev/gemini-cli/maintainer:latest';
    this.vpcName = config.vpcName || 'default';
    this.subnetName = config.subnetName || 'default';
  }

  async provision(options: { setupNetwork?: boolean } = {}): Promise<number> {
    const imageUri = this.imageUri;
    const region = this.zone.split('-').slice(0, 2).join('-');

    console.log(`🚀 Preparing infrastructure in ${this.projectId}...`);

    if (options.setupNetwork) {
        console.log(`🏗️  Ensuring Network Infrastructure (${this.vpcName})...`);
        const vpcCheck = spawnSync('gcloud', ['compute', 'networks', 'describe', this.vpcName, '--project', this.projectId], { stdio: 'pipe' });
        if (vpcCheck.status !== 0) {
          spawnSync('gcloud', ['compute', 'networks', 'create', this.vpcName, '--project', this.projectId, '--subnet-mode=custom'], { stdio: 'inherit' });
        }

        const subnetCheck = spawnSync('gcloud', ['compute', 'networks', 'subnets', 'describe', this.subnetName, '--project', this.projectId, '--region', region], { stdio: 'pipe' });
        if (subnetCheck.status !== 0) {
          spawnSync('gcloud', ['compute', 'networks', 'subnets', 'create', this.subnetName, '--project', this.projectId, '--network', this.vpcName, '--region', region, '--range=10.0.0.0/24', '--enable-private-ip-google-access'], { stdio: 'inherit' });
        }

        // Delegate backend-specific firewall rules to the strategy
        this.conn.setupNetworkInfrastructure(this.vpcName);
    }

    console.log(`🚀 Provisioning GCE COS worker: ${this.instanceName}...`);

    const startupScriptContent = `#!/bin/bash
      set -e
      echo "🚀 Initializing Unified Workspace..."
      mkdir -p /mnt/disks/data
      if ! mountpoint -q /mnt/disks/data; then
        DATA_DISK="/dev/disk/by-id/google-data"
        [ -e "$DATA_DISK" ] || DATA_DISK="/dev/sdb"
        while [ ! -e "$DATA_DISK" ]; do sleep 1; done
        blkid "$DATA_DISK" || mkfs.ext4 -m 0 -F "$DATA_DISK"
        mount -o discard,defaults "$DATA_DISK" /mnt/disks/data
      fi
      mkdir -p /mnt/disks/data/main /mnt/disks/data/worktrees /mnt/disks/data/scripts /mnt/disks/data/policies /mnt/disks/data/gemini-cli-config/.gemini
      chmod -R 777 /mnt/disks/data
      mkdir -p /home/node
      ln -sfn /mnt/disks/data /home/node/.workspaces
      chown -R 1000:1000 /home/node
      until docker info >/dev/null 2>&1; do sleep 2; done
      docker pull ${imageUri}
      if ! docker ps -a | grep -q "${this.workerName}"; then
        docker run -d --name ${this.workerName} --restart always --user root \\
          -v /mnt/disks/data:/mnt/disks/data:rw \\
          -v /mnt/disks/data/gemini-cli-config/.gemini:/home/node/.gemini:rw \\
          ${imageUri} /bin/bash -c "ln -sfn /mnt/disks/data /home/node/.workspaces && while true; do sleep 1000; done"
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
        '--machine-type', 'n2-standard-8',
        '--image-family', 'cos-stable',
        '--image-project', 'cos-cloud',
        '--boot-disk-size', '200GB',
        '--boot-disk-type', 'pd-balanced',
        '--create-disk', `name=${this.instanceName}-data,size=200,type=pd-balanced,device-name=google-data,auto-delete=yes`,
        '--metadata-from-file', `startup-script=${tmpScriptPath}`,
        '--metadata', 'enable-oslogin=TRUE',
        '--network-interface', networkInterface,
        '--scopes', 'https://www.googleapis.com/auth/cloud-platform',
        '--quiet',
    ], { stdio: 'inherit' });

    fs.unlinkSync(tmpScriptPath);
    if (result.status === 0) {
      console.log('⏳ Waiting for OS Login and SSH to initialize (this takes ~45s)...');
      await new Promise((r) => setTimeout(r, 45000));
      // Give strategy a chance to update overrideHost (e.g. for external IP)
      await this.conn.onProvisioned();
    }
    return result.status ?? 1;
  }

  async ensureReady(): Promise<number> {
    const status = await this.getStatus();
    if (status.status !== 'RUNNING') {
      console.log(`⚠️ Worker ${this.instanceName} is ${status.status}. Waking it up...`);
      const res = spawnSync('gcloud', ['compute', 'instances', 'start', this.instanceName, '--project', this.projectId, '--zone', this.zone], { stdio: 'inherit' });
      if (res.status !== 0) return res.status ?? 1;
      await new Promise((r) => setTimeout(r, 20000));
    }

    // CRITICAL: Ensure the connection strategy has the correct IP/hostname resolved
    // BEFORE we attempt any docker/remote commands.
    await this.conn.onProvisioned();

    console.log('   - Verifying remote container health...');
    let check = await this.getContainerStatus('development-worker');
    
    // During development/refactor, we often want to force-refresh the container 
    // to pick up new image layers (like the chunk fix).
    const isRefactorImage = this.imageUri.includes('mk-worker-refactor');
    
    if (!check.exists || !check.running || isRefactorImage) {
        console.log(`   ⚠️ Container stale or refactor image detected. Refreshing ${this.imageUri}...`);
        
        // Use the startup script logic but execute it directly via SSH for immediate effect
        const refreshCmd = `
          sudo docker pull ${this.imageUri}
          sudo docker rm -f development-worker || true
          sudo docker run -d --name development-worker --restart always --user root \\
            -v /mnt/disks/data:/mnt/disks/data:rw \\
            -v /mnt/disks/data/gemini-cli-config/.gemini:/home/node/.gemini:rw \\
            ${this.imageUri} /bin/bash -c "ln -sfn /mnt/disks/data /home/node/.workspaces && while true; do sleep 1000; done"
        `;
        await this.exec(refreshCmd);
    }

    console.log('⏳ Waiting for development-worker to stabilize...');
    for (let i = 0; i < 30; i++) {
        const status = await this.getContainerStatus('development-worker');
        if (status.running) return 0;
        await new Promise(r => setTimeout(r, 2000));
    }
    return 1;
  }

  async setup(options: SetupOptions): Promise<number> {
    console.log(`   - Verifying connection...`);
    // ensure strategy has current IP if needed
    await this.conn.onProvisioned();

    let res = this.conn.run('echo 1');
    if (res.status !== 0) {
      const status = await this.getStatus();
      if (status.internalIp) {
          console.log(`   ⚠️ Direct connection failed. Falling back to internal IP: ${status.internalIp}`);
          this.conn.setOverrideHost(status.internalIp);
          res = this.conn.run('echo 1');
      }
    }
    if (res.status !== 0) return 1;
    console.log('   ✅ Connection verified.');
    return 0;
  }

  getRunCommand(command: string, options: ExecOptions = {}): string {
    let finalCmd = command;
    if (options.wrapContainer) {
      finalCmd = `sudo docker exec ${options.interactive ? '-it' : ''} ${options.cwd ? `-w ${options.cwd}` : ''} ${options.wrapContainer} sh -c ${this.quote(command)}`;
    }
    return this.conn.getRunCommand(finalCmd, { interactive: options.interactive });
  }

  async exec(command: string, options: ExecOptions = {}): Promise<number> {
    const res = await this.getExecOutput(command, options);
    return res.status;
  }

  async getExecOutput(command: string, options: ExecOptions = {}): Promise<{ status: number; stdout: string; stderr: string }> {
    let finalCmd = command;
    if (options.wrapContainer) {
      finalCmd = `sudo docker exec ${options.interactive ? '-it' : ''} ${options.cwd ? `-w ${options.cwd}` : ''} ${options.wrapContainer} sh -c ${this.quote(command)}`;
    }
    return this.conn.run(finalCmd, { interactive: options.interactive, stdio: options.interactive ? 'inherit' : 'pipe', quiet: options.quiet });
  }

  async sync(localPath: string, remotePath: string, options: SyncOptions = {}): Promise<number> {
    console.log(`📦 Syncing ${localPath} to remote:${remotePath}...`);
    return this.conn.sync(localPath, remotePath, options);
  }

  async getStatus(): Promise<WorkspaceStatus> {
    const res = spawnSync('gcloud', ['compute', 'instances', 'describe', this.instanceName, '--project', this.projectId, '--zone', this.zone, '--format', 'json(name,status,networkInterfaces[0].networkIP,networkInterfaces[0].accessConfigs[0].natIP)'], { stdio: 'pipe' });
    if (res.status !== 0) return { name: this.instanceName, status: 'UNKNOWN' };
    try {
      const data = JSON.parse(res.stdout.toString());
      return { 
        name: data.name, 
        status: data.status, 
        internalIp: data.networkInterfaces?.[0]?.networkIP, 
        externalIp: data.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP 
      };
    } catch { return { name: this.instanceName, status: 'UNKNOWN' }; }
  }

  async stop(): Promise<number> {
    const res = spawnSync('gcloud', ['compute', 'instances', 'stop', this.instanceName, '--project', this.projectId, '--zone', this.zone], { stdio: 'inherit' });
    return res.status ?? 1;
  }

  async getContainerStatus(name: string): Promise<{ running: boolean; exists: boolean }> {
    const res = await this.getExecOutput(`sudo docker inspect -f '{{.State.Running}}' ${name}`, { quiet: true });
    if (res.status !== 0) return { running: false, exists: false };
    return { running: res.stdout.trim() === 'true', exists: true };
  }

  async runContainer(config: ContainerConfig): Promise<number> {
    const mountFlags = config.mounts.map(m => `-v ${m.host}:${m.container}${m.readonly ? ':ro' : ':rw'}`).join(' ');
    const envFlags = config.env ? Object.entries(config.env).map(([k, v]) => `-e ${k}=${this.quote(v)}`).join(' ') : '';
    const limits = `${config.cpuLimit ? `--cpus=${config.cpuLimit}` : ''} ${config.memoryLimit ? `--memory=${config.memoryLimit}` : ''}`;
    const dockerCmd = `sudo docker run -d --name ${config.name} --restart always ${config.user ? `--user ${config.user}` : ''} ${limits} ${mountFlags} ${envFlags} ${config.image} ${config.command || ''}`;
    return this.exec(dockerCmd);
  }

  async removeContainer(name: string): Promise<number> {
    return this.exec(`sudo docker rm -f ${name} || true`);
  }

  async capturePane(containerName: string): Promise<string> {
    const res = await this.getExecOutput('tmux capture-pane -pt $(tmux list-sessions -F "#S" | head -n 1) 2>/dev/null', { wrapContainer: containerName, quiet: true });
    return res.stdout;
  }

  async listWorkers(): Promise<number> {
    const user = process.env.USER || 'gcli-user';
    const instancePrefix = `gcli-workspace-${user}`;
    console.log(`🔍 Listing Workspace Workers for ${user} in ${this.projectId}...`);

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
    return res.status ?? 0;
  }

  async destroy(): Promise<number> {
    console.log(`🔥 DESTROYING worker ${this.instanceName} and its data disk...`);
    
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

    // Delete static IP if it exists
    const region = this.zone.split('-').slice(0, 2).join('-');
    const res2 = spawnSync(
      'gcloud',
      [
        'compute', 'addresses', 'delete', `${this.instanceName}-ip`,
        '--project', this.projectId,
        '--region', region,
        '--quiet',
      ],
      { stdio: 'pipe' },
    );
    return (res1.status === 0 || res1.status === null) ? 0 : 1;
  }

  async listContainers(): Promise<string[]> {
      const res = await this.getExecOutput("sudo docker ps --format '{{.Names}}' | grep '^gcli-'", { quiet: true });
      if (res.status === 0 && res.stdout.trim()) {
          return res.stdout.trim().split('\n');
      }
      return [];
  }

  private quote(str: string) { return `'${str.replace(/'/g, "'\\''")}'`; }
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'child_process';
import os from 'os';

/**
 * Centralized SSH/RSYNC management for GCE Workers.
 * Handles Magic Hostname routing with Zero-Knowledge security.
 * STRICTLY uses Direct Internal connection (Corporate Magic).
 */
export class GceConnectionManager {
  private projectId: string;
  private zone: string;
  private instanceName: string;
  private overrideHost: string | null = null;

  constructor(
    projectId: string, 
    zone: string, 
    instanceName: string, 
    private config: { dnsSuffix?: string, userSuffix?: string, backendType?: string } = {},
    private repoRoot: string = process.cwd()
  ) {
    this.projectId = projectId;
    this.zone = zone;
    this.instanceName = instanceName;
  }

  setOverrideHost(host: string | null) {
    this.overrideHost = host;
  }

  getMagicRemote(): string {
    const rawUser = process.env.USER || 'node';
    const userSuffix = this.config.userSuffix ?? '';
    const user = `${rawUser}${userSuffix}`;

    if (this.overrideHost) {
      return `${user}@${this.overrideHost}`;
    }

    const backend = this.config.backendType || 'direct-internal';
    
    if (backend === 'iap') {
        // IAP uses the instance name directly in gcloud
        return this.instanceName;
    }

    if (backend === 'external') {
        // External mode relies on overrideHost (set during setup) or falls back to magic
        return this.overrideHost ? `${user}@${this.overrideHost}` : `${user}@nic0.${this.instanceName}.${this.zone}.c.${this.projectId}.internal`;
    }

    const dnsTemplate = this.config.dnsSuffix || '.c.${projectId}.internal';
    const dnsSuffix = dnsTemplate.replace('${projectId}', this.projectId);
    
    return `${user}@nic0.${this.instanceName}.${this.zone}${dnsSuffix.startsWith('.') ? dnsSuffix : '.' + dnsSuffix}`;
  }

  getCommonArgs(): string[] {
    const backend = this.config.backendType || 'direct-internal';
    const args = [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'GlobalKnownHostsFile=/dev/null',
      '-o', 'CheckHostIP=no',
      '-o', 'LogLevel=ERROR',
      '-o', 'ConnectTimeout=60',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
    ];

    if (backend !== 'iap') {
        args.push('-o', 'ControlMaster=auto');
        args.push('-o', 'ControlPath=~/.ssh/gcli-%C');
        args.push('-o', 'ControlPersist=10m');
        args.push('-o', 'SendEnv=USER');
        args.push('-i', `${os.homedir()}/.ssh/google_compute_engine`);
    }

    return args;
  }

  getRunCommand(command: string, options: { interactive?: boolean } = {}): string {
    const fullRemote = this.getMagicRemote();
    const backend = this.config.backendType || 'direct-internal';

    if (backend === 'iap') {
        const iapArgs = [
            'gcloud', 'compute', 'ssh', fullRemote,
            '--project', this.projectId,
            '--zone', this.zone,
            '--tunnel-through-iap',
            '--command', this.quote(command)
        ];
        return iapArgs.join(' ');
    }

    return `ssh ${this.getCommonArgs().join(' ')} ${options.interactive ? '-t' : ''} ${fullRemote} ${this.quote(command)}`;
  }

  run(command: string, options: { interactive?: boolean; stdio?: 'pipe' | 'inherit'; quiet?: boolean } = {}): { status: number; stdout: string; stderr: string } {
    const sshCmd = this.getRunCommand(command, options);
    const res = spawnSync(sshCmd, { stdio: options.stdio || 'pipe', shell: true });
    
    const status = (res.status === null) ? 1 : res.status;

    // Differentiate between SSH connection errors (255) and command errors (other)
    if (status === 255) {
      console.error(`   ❌ SSH Connection Failed: ${this.getMagicRemote()}`);
      if (res.stderr) console.error(`   STDERR: ${res.stderr.toString()}`);
    } else if (status !== 0 && options.stdio !== 'inherit' && !options.quiet) {
      // This is a command failure, not an SSH failure
      console.error(`   ⚠️ Remote Command Failed (Status ${status}): ${command.substring(0, 100)}${command.length > 100 ? '...' : ''}`);
      if (res.stderr) console.error(`   STDERR: ${res.stderr.toString()}`);
    }

    return { 
      status, 
      stdout: res.stdout?.toString() || '', 
      stderr: res.stderr?.toString() || '' 
    };
  }

  sync(localPath: string, remotePath: string, options: { delete?: boolean; exclude?: string[]; sudo?: boolean } = {}): number {
    const fullRemote = this.getMagicRemote();
    const backend = this.config.backendType || 'direct-internal';

    // We use --no-t and --no-perms to avoid "Operation not permitted" errors 
    // when syncing to volumes that might have UID mismatches with the container.
    // We use --checksum to ensure we only sync files that have actually changed in content.
    const rsyncArgs = ['-rvz', '--quiet', '--checksum', '--no-t', '--no-perms', '--no-owner', '--no-group'];
    if (options.delete) rsyncArgs.push('--delete');
    if (options.exclude) options.exclude.forEach(ex => rsyncArgs.push(`--exclude="${ex}"`));
    
    // Use sudo on the remote side if requested to bypass permission errors
    if (options.sudo) {
        rsyncArgs.push('--rsync-path="sudo rsync"');
    }

    let sshBase = 'ssh';
    let sshArgs = this.getCommonArgs();

    if (backend === 'iap') {
        sshBase = 'gcloud compute ssh';
        sshArgs = [
            '--project', this.projectId,
            '--zone', this.zone,
            '--tunnel-through-iap'
        ];
    }

    const sshCmd = `${sshBase} ${sshArgs.join(' ')}`;
    const directRsync = `rsync ${rsyncArgs.join(' ')} -e ${this.quote(sshCmd)} ${localPath} ${fullRemote}:${remotePath}`;
    
    const res = spawnSync(directRsync, { stdio: 'inherit', shell: true });
    return res.status ?? 1;
  }

  private quote(str: string) {
    return `'${str.replace(/'/g, "'\\''")}'`;
  }
}

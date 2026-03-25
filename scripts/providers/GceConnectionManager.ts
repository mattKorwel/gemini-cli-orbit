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

  constructor(projectId: string, zone: string, instanceName: string, private repoRoot: string = process.cwd()) {
    this.projectId = projectId;
    this.zone = zone;
    this.instanceName = instanceName;
  }

  setOverrideHost(host: string | null) {
    this.overrideHost = host;
  }

  getMagicRemote(): string {
    const user = `${process.env.USER || 'node'}_google_com`;
    if (this.overrideHost) {
      return `${user}@${this.overrideHost}`;
    }
    const dnsSuffix = '.internal.gcpnode.com';
    return `${user}@nic0.${this.instanceName}.${this.zone}.c.${this.projectId}${dnsSuffix}`;
  }

  getCommonArgs(): string[] {
    const knownHostsPath = `${this.repoRoot}/.gemini/workspaces/known_hosts`;
    return [
      '-o', 'StrictHostKeyChecking=no',
      '-o', `UserKnownHostsFile=${knownHostsPath}`,
      '-o', 'GlobalKnownHostsFile=/dev/null',
      '-o', 'CheckHostIP=no',
      '-o', 'LogLevel=ERROR',
      '-o', 'ConnectTimeout=60',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'ControlMaster=auto',
      '-o', 'ControlPath=~/.ssh/gcli-%C',
      '-o', 'ControlPersist=10m',
      '-o', 'SendEnv=USER',
      '-i', `${os.homedir()}/.ssh/google_compute_engine`
    ];
  }

  getRunCommand(command: string, options: { interactive?: boolean } = {}): string {
    const fullRemote = this.getMagicRemote();
    return `ssh ${this.getCommonArgs().join(' ')} ${options.interactive ? '-t' : ''} ${fullRemote} ${this.quote(command)}`;
  }

  run(command: string, options: { interactive?: boolean; stdio?: 'pipe' | 'inherit'; quiet?: boolean } = {}): { status: number; stdout: string; stderr: string } {
    const sshCmd = this.getRunCommand(command, options);
    const res = spawnSync(sshCmd, { stdio: options.stdio || 'pipe', shell: true });
    const status = (res.status === null) ? 1 : res.status;
    if (status !== 0 && options.stdio !== 'inherit' && !options.quiet) {
        console.error(`   ❌ SSH Command failed (status ${status}): ${sshCmd}`);
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

    const sshCmd = `ssh ${this.getCommonArgs().join(' ')}`;
    const directRsync = `rsync ${rsyncArgs.join(' ')} -e ${this.quote(sshCmd)} ${localPath} ${fullRemote}:${remotePath}`;
    
    const res = spawnSync(directRsync, { stdio: 'inherit', shell: true });
    return res.status ?? 1;
  }

  private quote(str: string) {
    return `'${str.replace(/'/g, "'\\''")}'`;
  }
}

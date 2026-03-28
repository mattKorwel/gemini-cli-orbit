/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'child_process';
import type { ConnectivityStrategy } from './strategies/ConnectivityStrategy.js';
import { IapStrategy } from './strategies/IapStrategy.js';
import { ExternalStrategy } from './strategies/ExternalStrategy.js';
import { DirectInternalStrategy } from './strategies/DirectInternalStrategy.js';
import { BaseStrategy } from './strategies/BaseStrategy.js';

/**
 * Centralized SSH/RSYNC management for GCE Stations.
 * Delegates to backend-specific strategies.
 */
export class GceConnectionManager {
  private strategy: ConnectivityStrategy;

  constructor(
    projectId: string, 
    zone: string, 
    instanceName: string, 
    private config: { dnsSuffix?: string | undefined, userSuffix?: string | undefined, backendType?: string | undefined } = {},
    private repoRoot: string = process.cwd()
  ) {
    const backend = config.backendType || 'direct-internal';
    const cleanConfig: { dnsSuffix?: string, userSuffix?: string, backendType?: string } = {};
    if (config.dnsSuffix !== undefined) cleanConfig.dnsSuffix = config.dnsSuffix;
    if (config.userSuffix !== undefined) cleanConfig.userSuffix = config.userSuffix;
    if (config.backendType !== undefined) cleanConfig.backendType = config.backendType;
    
    if (backend === 'iap') {
        this.strategy = new IapStrategy(projectId, zone, instanceName, cleanConfig);
    } else if (backend === 'external') {
        this.strategy = new ExternalStrategy(projectId, zone, instanceName, cleanConfig);
    } else {
        this.strategy = new DirectInternalStrategy(projectId, zone, instanceName, cleanConfig);
    }
  }

  setOverrideHost(host: string | null) {
    this.strategy.setOverrideHost(host);
  }

  getBackendType(): string {
    return this.strategy.getBackendType();
  }

  getMagicRemote(): string {
    return this.strategy.getMagicRemote();
  }

  getCommonArgs(): string[] {
    return this.strategy.getCommonArgs();
  }

  getRunCommand(command: string, options: { interactive?: boolean | undefined } = {}): string {
    return this.strategy.getRunCommand(command, options);
  }

  setupNetworkInfrastructure(vpcName: string): void {
    this.strategy.setupNetworkInfrastructure(vpcName);
  }

  getNetworkInterfaceConfig(vpcName: string, subnetName: string): string {
    return this.strategy.getNetworkInterfaceConfig(vpcName, subnetName);
  }

  async onProvisioned(): Promise<void> {
    await this.strategy.onProvisioned();
  }

  run(command: string, options: { interactive?: boolean | undefined; stdio?: 'pipe' | 'inherit' | undefined; quiet?: boolean | undefined } = {}): { status: number; stdout: string; stderr: string } {
    const sshCmd = this.getRunCommand(command, options);
    const res = spawnSync(sshCmd, { stdio: options.stdio || 'pipe', shell: true });
    
    const status = (res.status === null) ? 1 : res.status;

    // Differentiate between SSH connection errors (255) and command errors (other)
    if (status === 255) {
      console.error(`   ❌ SSH Connection Failed: ${this.getMagicRemote()}`);
      if (res.stderr) console.error(`   STDERR: ${res.stderr.toString()}`);
    } else if (status !== 0 && options.stdio !== 'inherit' && !options.quiet) {
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
    const backend = this.getBackendType();

    const rsyncArgs = ['-rvz', '--quiet', '--checksum', '--no-t', '--no-perms', '--no-owner', '--no-group'];
    if (options.delete) rsyncArgs.push('--delete');
    if (options.exclude) options.exclude.forEach(ex => rsyncArgs.push(`--exclude="${ex}"`));
    if (options.sudo) rsyncArgs.push('--rsync-path="sudo rsync"');

    let sshCmd: string;
    if (backend === 'iap') {
        const strat = this.strategy as BaseStrategy;
        sshCmd = `gcloud compute ssh --project ${strat.projectId} --zone ${strat.zone} --tunnel-through-iap`;
    } else {
        sshCmd = `ssh ${this.getCommonArgs().join(' ')}`;
    }

    const directRsync = `rsync ${rsyncArgs.join(' ')} -e '${sshCmd}' ${localPath} ${fullRemote}:${remotePath}`;
    
    const res = spawnSync(directRsync, { stdio: 'inherit', shell: true });
    return res.status ?? 1;
  }
}

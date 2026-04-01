/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { DirectInternalStrategy } from './strategies/DirectInternalStrategy.js';
import { ExternalStrategy } from './strategies/ExternalStrategy.js';
import type { BaseStrategy } from './strategies/BaseStrategy.js';
import type { OrbitConfig } from '../Constants.js';

/**
 * GceConnectionManager handles connection strategy selection and SSH execution.
 */
export class GceConnectionManager {
  private strategy: BaseStrategy;

  constructor(
    private projectId: string,
    private zone: string,
    private instanceName: string,
    private config: OrbitConfig,
  ) {
    const backend = config.backendType || 'direct-internal';

    const strategyConfig = {
      ...(config.dnsSuffix !== undefined
        ? { dnsSuffix: config.dnsSuffix }
        : {}),
      ...(config.userSuffix !== undefined
        ? { userSuffix: config.userSuffix }
        : {}),
      ...(config.backendType !== undefined
        ? { backendType: config.backendType }
        : {}),
    };

    if (backend === 'external') {
      this.strategy = new ExternalStrategy(
        this.projectId,
        this.zone,
        this.instanceName,
        strategyConfig as any,
      );
    } else {
      // Default to direct-internal
      this.strategy = new DirectInternalStrategy(
        this.projectId,
        this.zone,
        this.instanceName,
        strategyConfig as any,
      );
    }
  }

  /**
   * Sets a specific host override (e.g. dynamic IP).
   */
  setOverrideHost(host: string) {
    this.strategy.setOverrideHost(host);
  }

  /**
   * Called after provisioning to allow strategies to resolve IPs etc.
   */
  async onProvisioned(): Promise<void> {
    if (this.strategy.onProvisioned) {
      await this.strategy.onProvisioned();
    }
  }

  /**
   * Returns the network interface arguments for gcloud instances create.
   */
  getNetworkInterfaceArgs(vpcName: string, subnetName: string): string[] {
    return this.strategy.getNetworkInterfaceArgs(vpcName, subnetName);
  }

  /**
   * Performs any backend-specific network setup (firewalls etc).
   */
  setupNetworkInfrastructure(vpcName: string): void {
    if (this.strategy.setupNetworkInfrastructure) {
      this.strategy.setupNetworkInfrastructure(vpcName);
    }

    // Always ensure internal SSH is allowed for direct-internal
    if (this.config.backendType !== 'external') {
      spawnSync(
        'gcloud',
        [
          'compute',
          'firewall-rules',
          'create',
          'allow-corporate-ssh',
          '--project',
          this.projectId,
          '--network',
          vpcName,
          '--allow=tcp:22',
          '--source-ranges=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16',
        ],
        { stdio: 'inherit' },
      );
    }
  }

  /**
   * Generates a complete shell-safe SSH command.
   */
  getRunCommand(
    command: string,
    options: { interactive?: boolean; env?: Record<string, string> } = {},
  ): string {
    let finalCommand = command;
    if (options.env) {
      const envPrefix = Object.entries(options.env)
        .map(([k, v]) => `${k}=${this.q(v)}`)
        .join(' ');
      finalCommand = `${envPrefix} ${command}`;
    }
    return this.strategy.getRunCommand(finalCommand, {
      ...(options.interactive !== undefined
        ? { interactive: options.interactive }
        : {}),
    });
  }

  /**
   * Generates an array of arguments for spawnSync.
   */
  getRunArgs(
    command: string,
    options: { interactive?: boolean; env?: Record<string, string> } = {},
  ): string[] {
    let finalCommand = command;
    if (options.env) {
      const envPrefix = Object.entries(options.env)
        .map(([k, v]) => `${k}=${this.q(v)}`)
        .join(' ');
      finalCommand = `${envPrefix} ${command}`;
    }
    const args = ['ssh', ...this.strategy.getCommonArgs()];
    if (options.interactive) args.push('-t');
    args.push(this.strategy.getMagicRemote());
    args.push(finalCommand);
    return args;
  }

  /**
   * Executes a command on the remote host via the selected strategy.
   */
  run(
    command: string,
    options: {
      interactive?: boolean;
      quiet?: boolean;
      env?: Record<string, string>;
    } = {},
  ): SpawnSyncReturns<Buffer> {
    const fullCmd = this.getRunCommand(command, options);

    return spawnSync(fullCmd, {
      stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: true,
      env: process.env,
    });
  }

  private q(val: string): string {
    return `'${val.replace(/'/g, "'\\''")}'`;
  }

  /**
   * Generates an rsync-compatible SSH string.
   */
  getRsyncSshArg(): string {
    return 'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null';
  }

  /**
   * Synchronizes local path to remote path.
   */
  async sync(
    localPath: string,
    remotePath: string,
    options: { delete?: boolean; exclude?: string[]; sudo?: boolean } = {},
  ): Promise<number> {
    const user = this.strategy.getMagicRemote();
    const rsyncArgs = ['-avz', '--progress'];
    if (options.delete) rsyncArgs.push('--delete');
    if (options.exclude) {
      options.exclude.forEach((pattern) => {
        rsyncArgs.push('--exclude', pattern);
      });
    }

    if (options.sudo) {
      rsyncArgs.push('--rsync-path', 'sudo rsync');
    }

    rsyncArgs.push('-e', this.getRsyncSshArg());
    rsyncArgs.push(localPath, `${user}:${remotePath}`);

    const res = spawnSync('rsync', rsyncArgs, { stdio: 'inherit' });
    return res.status ?? (res.error ? 1 : 0);
  }
}

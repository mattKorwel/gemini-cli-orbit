/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { DirectInternalStrategy } from './strategies/DirectInternalStrategy.js';
import { ExternalStrategy } from './strategies/ExternalStrategy.js';
import type { BaseStrategy } from './strategies/BaseStrategy.js';
import type { InfrastructureSpec } from '../core/Constants.js';

/**
 * GceConnectionManager handles connection strategy selection and SSH execution.
 */
export class GceConnectionManager {
  private strategy: BaseStrategy;

  constructor(
    private projectId: string,
    private zone: string,
    private instanceName: string,
    private infra: InfrastructureSpec,
  ) {
    const backend = infra.backendType || 'direct-internal';

    const strategyConfig = {
      ...(infra.dnsSuffix !== undefined ? { dnsSuffix: infra.dnsSuffix } : {}),
      ...(infra.userSuffix !== undefined
        ? { userSuffix: infra.userSuffix }
        : {}),
      ...(infra.backendType !== undefined
        ? { backendType: infra.backendType }
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

  getBackendType(): string {
    return this.strategy.getBackendType();
  }

  getMagicRemote(): string {
    return this.strategy.getMagicRemote();
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

  private q(val: string): string {
    return `'${val.replace(/'/g, "'\\''")}'`;
  }

  /**
   * Returns the raw command string that would be used to execute a command.
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
    return this.strategy.getRunCommand(finalCommand, options);
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

    const res = spawnSync(fullCmd, {
      stdio: [
        options.interactive ? 'inherit' : 'ignore',
        options.quiet ? 'pipe' : 'inherit',
        'pipe',
      ],
      shell: true,
      env: {
        ...process.env,
        CLOUDSDK_CORE_VERBOSITY: 'error',
        ...options.env,
      },
    });

    if (res.stderr) {
      const stderr = res.stderr.toString();
      const filtered = stderr
        .split('\n')
        .filter((line) => {
          const l = line.toLowerCase();
          if (l.includes('existing host keys found')) return false;
          if (l.includes('created [https://www.googleapis.com/')) return false;
          if (
            l.includes(
              'external ip address was not found; defaulting to using iap',
            )
          )
            return false;
          return true;
        })
        .join('\n')
        .trim();

      if (filtered && !options.quiet) {
        process.stderr.write(filtered + '\n');
      }
    }

    return res;
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

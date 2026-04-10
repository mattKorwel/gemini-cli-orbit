/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import {
  type StationTransport,
  type IProcessManager,
  type IProcessResult,
} from '../core/interfaces.js';
import { type Command } from '../core/executors/types.js';
import {
  type SyncOptions,
  type ExecOptions,
  type ExecResult,
} from '../core/types.js';
import type { ISshExecutor } from '../core/executors/SshExecutor.js';
import { type InfrastructureSpec } from '../core/Constants.js';

/**
 * SshTransport: Remote transport implementation using SSH and MagicRemote.
 */
export class SshTransport implements StationTransport {
  public readonly type = 'ssh';
  private activeTunnels: Set<number> = new Set();
  private overrideHost: string | null = null;

  constructor(
    private readonly projectId: string,
    private readonly zone: string,
    private readonly instanceName: string,
    private readonly infra: InfrastructureSpec,
    private readonly pm: IProcessManager,
    private readonly ssh: ISshExecutor,
  ) {}

  public setOverrideHost(host: string): void {
    this.overrideHost = host;
  }

  public getMagicRemote(): string {
    return this.getConnectionHandle();
  }

  public getConnectionHandle(): string {
    const user = this.getStandardUser();

    if (this.overrideHost) {
      return `${user}@${this.overrideHost}`;
    }

    const customSuffix = this.infra.dnsSuffix || 'internal';
    const baseSuffix = `.c.${this.projectId}`;
    let fullSuffix = '';

    if (customSuffix.startsWith('.')) {
      fullSuffix = `${baseSuffix}${customSuffix}`;
    } else {
      fullSuffix = `${baseSuffix}.${customSuffix}`;
    }

    return `${user}@nic0.${this.instanceName}.${this.zone}${fullSuffix}`;
  }

  public async exec(
    command: string | Command,
    options: ExecOptions = {},
  ): Promise<ExecResult> {
    const target = this.getConnectionHandle();
    const cmdStr =
      typeof command === 'string'
        ? command
        : `${command.bin} ${command.args.join(' ')}`;

    return this.withConnectivityRetry(async () => {
      const res = await this.ssh.execAsync(target, cmdStr, {
        ...options,
        env: { ...options.env, CLOUDSDK_CORE_VERBOSITY: 'error' },
      });

      const result = this.processResult(res, options);
      if (result.status === 255) {
        throw new Error(
          `SSH Command failed with exit code 255: ${result.stderr}`,
        );
      }
      return result;
    });
  }

  public async attach(
    containerName: string,
    sessionName: string,
  ): Promise<number> {
    const target = this.getConnectionHandle();
    const term = process.env.TERM || 'xterm-256color';
    const colorTerm = process.env.COLORTERM || 'truecolor';
    const forceColor = process.env.FORCE_COLOR || '3';

    // Starfleet standard: persistent tmux session named after the action or mission
    const attachCmd = `sudo docker exec -it -e TERM=${term} -e COLORTERM=${colorTerm} -e FORCE_COLOR=${forceColor} ${containerName} tmux attach -t ${sessionName} || sudo docker exec -it -e TERM=${term} -e COLORTERM=${colorTerm} -e FORCE_COLOR=${forceColor} ${containerName} /bin/bash`;

    const res = this.pm.runSync('ssh', ['-t', target, attachCmd], {
      interactive: true,
      env: {
        ...process.env,
        TERM: term,
        COLORTERM: colorTerm,
        FORCE_COLOR: forceColor,
      },
    });
    return res.status;
  }

  public async sync(
    localPath: string,
    remotePath: string,
    options: SyncOptions = {},
  ): Promise<number> {
    const remote = `${this.getConnectionHandle()}:${remotePath}`;

    return this.withConnectivityRetry(async () => {
      const res = this.ssh.rsync(localPath, remote, options);
      if (res.status !== 0) {
        throw new Error(
          `Rsync failed with exit code ${res.status}: ${res.stderr}`,
        );
      }
      return res.status;
    });
  }

  public async ensureTunnel(
    localPort: number,
    remotePort: number,
  ): Promise<void> {
    if (this.activeTunnels.has(localPort)) return;

    const target = this.getConnectionHandle();
    const home = os.homedir();

    await this.pm.runAsync(
      'ssh',
      [
        '-i',
        `${home}/.ssh/google_compute_engine`,
        '-o',
        'StrictHostKeyChecking=no',
        '-o',
        'UserKnownHostsFile=/dev/null',
        '-o',
        'ControlMaster=auto',
        '-o',
        'ControlPath=~/.ssh/orbit-%C',
        '-o',
        'ControlPersist=10m',
        '-L',
        `${localPort}:localhost:${remotePort}`,
        '-N',
        '-f',
        target,
      ],
      { detached: true } as any,
    );

    this.activeTunnels.add(localPort);
  }

  private async withConnectivityRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      delayMs?: number;
      showProgress?: boolean;
    } = {},
  ): Promise<T> {
    const { maxAttempts = 5, delayMs = 2000, showProgress = true } = options;
    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (err: any) {
        lastError = err;
        const msg = err.message || '';
        const isTransient =
          msg.includes('code 255') ||
          msg.includes('Connection closed') ||
          msg.includes('Connection reset') ||
          msg.includes('timeout') ||
          msg.includes('SSO');

        if (!isTransient || attempt === maxAttempts) {
          throw err;
        }

        if (showProgress) process.stdout.write('.');
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
    throw lastError;
  }

  private processResult(res: IProcessResult, options: ExecOptions): ExecResult {
    let stdout = res.stdout?.toString() || '';
    let stderr = res.stderr?.toString() || '';

    const filterNoise = (text: string) =>
      text
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

    stdout = filterNoise(stdout);
    stderr = filterNoise(stderr);

    if (stderr && !options.quiet && !options.interactive) {
      process.stderr.write(stderr + '\n');
    }

    return { status: res.status, stdout, stderr };
  }

  private getStandardUser(): string {
    const rawUser = this.infra.sshUser || process.env.USER || 'node';
    const userSuffix = this.infra.userSuffix ?? '';
    return `${rawUser}${userSuffix}`;
  }
}

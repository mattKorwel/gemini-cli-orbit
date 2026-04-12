/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {
  type StationTransport,
  type IProcessManager,
  type IProcessResult,
} from '../../core/interfaces.js';
import { type Command } from '../../core/executors/types.js';
import {
  type SyncOptions,
  type ExecOptions,
  type ExecResult,
} from '../../core/types.js';
import type { ISshExecutor } from '../../core/executors/ssh/SshExecutor.js';
import { type InfrastructureSpec } from '../../core/Constants.js';
import {
  getDefinedProcessEnv,
  getInteractiveTerminalEnv,
} from '../../utils/TerminalEnv.js';

/**
 * SshTransport: Remote transport implementation using SSH-backed command and
 * file transfer primitives.
 */
export class SshTransport implements StationTransport {
  public readonly type = 'ssh';
  protected activeTunnels: Set<number> = new Set();
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
    const fullSuffix = customSuffix.startsWith('.')
      ? `${baseSuffix}${customSuffix}`
      : `${baseSuffix}.${customSuffix}`;

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
    const terminalEnv = getInteractiveTerminalEnv();
    const dockerEnvArgs = Object.entries(terminalEnv)
      .map(([key, value]) => `-e ${key}=${value}`)
      .join(' ');

    const attachCmd = `sudo docker exec -it ${dockerEnvArgs} ${containerName} tmux attach -t ${sessionName} || sudo docker exec -it ${dockerEnvArgs} ${containerName} /bin/bash`;

    const res = this.ssh.exec(target, attachCmd, {
      interactive: true,
      env: {
        ...getDefinedProcessEnv(),
        ...terminalEnv,
      },
    });
    return res.status;
  }

  public async sync(
    localPath: string,
    remotePath: string,
    options: SyncOptions = {},
  ): Promise<number> {
    const trimmedLocal = localPath.replace(/[\\/]+$/, '');
    const sourcePath = trimmedLocal || localPath;
    const isDirectory =
      fs.existsSync(sourcePath) && fs.statSync(sourcePath).isDirectory();
    const target = this.getConnectionHandle();

    return this.withConnectivityRetry(async () => {
      const prepPath = isDirectory
        ? remotePath
        : path.posix.dirname(remotePath);
      const quotedPrepPath = prepPath.replace(/'/g, "'\\''");
      const prepCommand =
        options.delete && isDirectory
          ? `sudo rm -rf '${quotedPrepPath}' && sudo mkdir -p '${quotedPrepPath}'`
          : `${options.sudo ? 'sudo ' : ''}mkdir -p '${quotedPrepPath}'`;
      const prepRes = await this.ssh.execAsync(target, prepCommand, {
        quiet: true,
      });
      if (prepRes.status !== 0) {
        throw new Error(
          `Remote prepare failed with exit code ${prepRes.status}: ${prepRes.stderr}`,
        );
      }

      const copyOptions: { quiet?: boolean; directory?: boolean } = {
        directory: isDirectory,
      };
      if (options.quiet !== undefined) {
        copyOptions.quiet = options.quiet;
      }
      const res = this.ssh.copyTo(target, localPath, remotePath, copyOptions);
      if (res.status !== 0) {
        throw new Error(
          `File transfer failed with exit code ${res.status}: ${res.stderr}`,
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
    await this.pm.runAsync(
      'ssh',
      this.getTunnelArgs(target, localPort, remotePort),
      {
        detached: true,
      } as any,
    );

    this.activeTunnels.add(localPort);
  }

  protected getTunnelArgs(
    target: string,
    localPort: number,
    remotePort: number,
  ): string[] {
    const home = os.homedir();
    return [
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
    ];
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

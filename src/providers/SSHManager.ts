/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { InfrastructureSpec } from '../core/Constants.js';
import {
  type IProcessManager,
  type IProcessResult,
} from '../core/interfaces.js';
import { type SyncOptions } from '../core/types.js';
import type { ISshExecutor } from '../core/executors/SshExecutor.js';

/**
 * Represents a structured command to be executed remotely.
 */
export interface RemoteCommand {
  bin: string;
  args: string[];
  cwd?: string;
  user?: string;
  env?: Record<string, string>;
}

/**
 * Result of a remote execution.
 */
export interface ExecResult {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * Options for SSH execution.
 */
export interface SSHOptions {
  interactive?: boolean;
  quiet?: boolean;
  timeout?: number;
  env?: Record<string, string>;
}

/**
 * Interface for SSH-based remote operations.
 */
export interface SSHManager {
  getMagicRemote(): string;
  setOverrideHost(host: string | null): void;
  runHostCommand(cmd: RemoteCommand, options?: SSHOptions): Promise<ExecResult>;
  runDockerExec(
    container: string,
    cmd: RemoteCommand,
    options?: SSHOptions,
  ): Promise<ExecResult>;
  syncPath(
    localPath: string,
    remotePath: string,
    options?: {
      delete?: boolean;
      exclude?: string[];
      sudo?: boolean;
      quiet?: boolean;
    },
  ): Promise<number>;
  syncPathIfChanged(
    localPath: string,
    remotePath: string,
    options?: {
      delete?: boolean;
      exclude?: string[];
      sudo?: boolean;
      quiet?: boolean;
    },
  ): Promise<number>;
  attachToTmux(container: string, sessionName?: string): Promise<number>;

  /**
   * Executes a function with retries for transient connectivity issues.
   */
  withConnectivityRetry<T>(
    operation: () => Promise<T>,
    options?: {
      maxAttempts?: number;
      delayMs?: number;
      showProgress?: boolean;
    },
  ): Promise<T>;
}

/**
 * Concrete GCE implementation of SSHManager.
 */
export class GceSSHManager implements SSHManager {
  private overrideHost: string | null = null;

  constructor(
    private readonly projectId: string,
    private readonly zone: string,
    private readonly instanceName: string,
    private readonly infra: InfrastructureSpec,
    private readonly pm: IProcessManager,
    private readonly ssh: ISshExecutor,
  ) {}

  public getMagicRemote(): string {
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

  public setOverrideHost(host: string | null): void {
    this.overrideHost = host;
  }

  public async runHostCommand(
    cmd: RemoteCommand,
    options: SSHOptions = {},
  ): Promise<ExecResult> {
    const fullCmdStr = this.commandToString(cmd);
    const target = this.getMagicRemote();

    return this.withConnectivityRetry(async () => {
      const res = await this.ssh.execAsync(target, fullCmdStr, {
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

  public async runDockerExec(
    container: string,
    cmd: RemoteCommand,
    options: SSHOptions = {},
  ): Promise<ExecResult> {
    const dockerArgs = ['exec'];
    if (options.interactive) dockerArgs.push('-it');
    if (cmd.user) dockerArgs.push('-u', cmd.user);
    if (cmd.cwd) dockerArgs.push('-w', cmd.cwd);

    // ADR 0018: Pass manifest and other env vars via native -e flags
    if (cmd.env) {
      Object.entries(cmd.env).forEach(([k, v]) => {
        dockerArgs.push('-e', `${k}=${this.quote(v)}`);
      });
    }

    dockerArgs.push(container);

    // Wrap the command in bash -c to ensure environment and paths are handled correctly
    const innerCmd = `${this.quote(cmd.bin)} ${cmd.args.map((a) => this.quote(a)).join(' ')}`;
    dockerArgs.push('/bin/bash', '-c', innerCmd);

    const dockerCmd: RemoteCommand = {
      bin: 'sudo docker',
      args: dockerArgs,
    };

    return this.runHostCommand(dockerCmd, options);
  }

  public async syncPath(
    localPath: string,
    remotePath: string,
    options: SyncOptions = {},
  ): Promise<number> {
    const remote = `${this.getMagicRemote()}:${remotePath}`;

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

  /**
   * Syncs a path ONLY if the local content hash has changed.
   */
  public async syncPathIfChanged(
    localPath: string,
    remotePath: string,
    options: SyncOptions = {},
  ): Promise<number> {
    const localHash = this.generateDirectoryHash(localPath);
    const hashFile = `.orbit.${path.basename(localPath)}.hash`;
    const remoteHashPath = `/tmp/${hashFile}`;

    // Read remote hash (with retry)
    const remoteHashRes = await this.withConnectivityRetry(async () => {
      const res = await this.runHostCommand(
        {
          bin: 'cat',
          args: [remoteHashPath],
        },
        { quiet: true },
      );
      // cat returning 1 (missing file) is NOT an SSH failure, don't retry based on that
      if (res.status !== 0 && res.status !== 1) {
        throw new Error(`SSH Command failed with exit code ${res.status}`);
      }
      return res;
    });

    if (
      remoteHashRes.status === 0 &&
      remoteHashRes.stdout.trim() === localHash
    ) {
      return 0; // Identical, skip sync
    }

    // Perform sync
    const status = await this.syncPath(localPath, remotePath, options);
    if (status === 0) {
      // Update remote hash (with retry)
      await this.withConnectivityRetry(async () => {
        const res = await this.runHostCommand(
          {
            bin: 'sh',
            args: ['-c', `echo ${localHash} > ${remoteHashPath}`],
          },
          { quiet: true },
        );
        if (res.status !== 0) {
          throw new Error(`SSH Command failed with exit code ${res.status}`);
        }
        return res;
      });
    }

    return status;
  }

  /**
   * Executes a function with retries for transient connectivity issues.
   */
  public async withConnectivityRetry<T>(
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
        // Only retry on potential connection/SSO issues (exit 255 is common for SSH failures)
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

  public async attachToTmux(
    container: string,
    sessionName: string = 'default',
  ): Promise<number> {
    const attachCmd = `sudo docker exec -it ${container} tmux attach -t ${sessionName} || sudo docker exec -it ${container} /bin/bash`;
    const target = this.getMagicRemote();

    const res = this.ssh.exec(target, attachCmd, { interactive: true });
    return res.status;
  }

  private processResult(res: IProcessResult, options: SSHOptions): ExecResult {
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

    return {
      status: res.status,
      stdout,
      stderr,
    };
  }

  private generateDirectoryHash(dirPath: string): string {
    if (!fs.existsSync(dirPath)) return 'none';
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return crypto
        .createHash('md5')
        .update(fs.readFileSync(dirPath))
        .digest('hex');
    }

    const hash = crypto.createHash('md5');
    const processDir = (currentPath: string) => {
      const files = fs.readdirSync(currentPath).sort();
      for (const file of files) {
        const fullPath = path.join(currentPath, file);
        const fstats = fs.statSync(fullPath);

        // Add relative path to hash to detect renames/moves
        hash.update(path.relative(dirPath, fullPath));

        if (fstats.isDirectory()) {
          processDir(fullPath);
        } else if (fstats.isFile()) {
          hash.update(fs.readFileSync(fullPath));
        }
      }
    };

    processDir(dirPath);
    return hash.digest('hex');
  }

  private commandToString(cmd: RemoteCommand): string {
    const envPrefix = cmd.env
      ? Object.entries(cmd.env)
          .map(([k, v]) => `${k}=${this.quote(v)}`)
          .join(' ') + ' '
      : '';
    const bin = cmd.bin;
    const args = cmd.args.map((a) => this.quote(a)).join(' ');
    return `${envPrefix}${bin} ${args}`;
  }

  private quote(str: string): string {
    return `'${str.replace(/'/g, "'\\''")}'`;
  }

  private getStandardUser(): string {
    const rawUser = this.infra.sshUser || process.env.USER || 'node';
    const userSuffix = this.infra.userSuffix ?? '';
    return `${rawUser}${userSuffix}`;
  }
}

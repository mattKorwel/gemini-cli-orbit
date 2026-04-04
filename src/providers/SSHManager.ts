/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { InfrastructureSpec } from '../core/Constants.js';

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
    options?: { delete?: boolean; exclude?: string[]; sudo?: boolean },
  ): Promise<number>;
  syncPathIfChanged(
    localPath: string,
    remotePath: string,
    options?: { delete?: boolean; exclude?: string[]; sudo?: boolean },
  ): Promise<number>;
  attachToTmux(container: string, sessionName?: string): Promise<number>;
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
  ) {}

  public getMagicRemote(): string {
    const user = this.getStandardUser();
    if (this.overrideHost) {
      return `${user}@${this.overrideHost}`;
    }

    if (this.infra.backendType === 'external') {
      return `${user}@nic0.${this.instanceName}.${this.zone}.c.${this.projectId}.internal`;
    }

    const customSuffix = this.infra.dnsSuffix || '';
    const baseSuffix = `.c.${this.projectId}`;
    let fullSuffix = baseSuffix;

    if (customSuffix) {
      fullSuffix += customSuffix.startsWith('.')
        ? customSuffix
        : `.${customSuffix}`;
    } else {
      fullSuffix += '.internal';
    }

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

    if (this.infra.backendType === 'external' && !this.overrideHost) {
      const args = [
        'compute',
        'ssh',
        this.instanceName,
        '--project',
        this.projectId,
        '--zone',
        this.zone,
        '--quiet',
        '--command',
        fullCmdStr,
        '--ssh-flag="-o LogLevel=ERROR"',
      ];
      if (options.interactive) args.push('--ssh-flag="-t"');

      return this.execute('gcloud', args, options);
    }

    const sshArgs = [
      ...this.getCommonSshArgs(),
      options.interactive ? '-t' : '',
      this.getMagicRemote(),
      fullCmdStr,
    ].filter(Boolean);

    return this.execute('ssh', sshArgs, options);
  }

  public async runDockerExec(
    container: string,
    cmd: RemoteCommand,
    options: SSHOptions = {},
  ): Promise<ExecResult> {
    const dockerArgs = [
      'exec',
      options.interactive ? '-it' : '',
      cmd.user ? `-u ${cmd.user}` : '',
      cmd.cwd ? `-w ${cmd.cwd}` : '',
      container,
      '/bin/bash',
      '-c',
      this.quote(this.commandToString(cmd)),
    ].filter(Boolean);

    const dockerCmd: RemoteCommand = {
      bin: 'sudo docker',
      args: dockerArgs,
    };

    return this.runHostCommand(dockerCmd, options);
  }

  public async syncPath(
    localPath: string,
    remotePath: string,
    options: { delete?: boolean; exclude?: string[]; sudo?: boolean } = {},
  ): Promise<number> {
    const remote = this.getMagicRemote();
    const rsyncArgs = ['-avz'];
    if (!this.infra.verbose) rsyncArgs.push('--quiet');

    if (options.delete) rsyncArgs.push('--delete');
    if (options.exclude) {
      options.exclude.forEach((pattern) => {
        rsyncArgs.push('--exclude', pattern);
      });
    }

    if (options.sudo) {
      rsyncArgs.push('--rsync-path', 'sudo rsync');
    }

    const sshArg = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i ${os.homedir()}/.ssh/google_compute_engine`;
    rsyncArgs.push('-e', sshArg);
    rsyncArgs.push(localPath, `${remote}:${remotePath}`);

    const res = spawnSync('rsync', rsyncArgs, { stdio: 'inherit' });
    return res.status ?? (res.error ? 1 : 0);
  }

  /**
   * Syncs a path ONLY if the local content hash has changed.
   */
  public async syncPathIfChanged(
    localPath: string,
    remotePath: string,
    options: { delete?: boolean; exclude?: string[]; sudo?: boolean } = {},
  ): Promise<number> {
    const localHash = this.generateDirectoryHash(localPath);
    const hashFile = `.orbit.${path.basename(localPath)}.hash`;
    const remoteHashPath = `/tmp/${hashFile}`;

    // Read remote hash
    const remoteHashRes = await this.runHostCommand(
      {
        bin: 'cat',
        args: [remoteHashPath],
      },
      { quiet: true },
    );

    if (
      remoteHashRes.status === 0 &&
      remoteHashRes.stdout.trim() === localHash
    ) {
      return 0; // Identical, skip sync
    }

    // Perform sync
    const status = await this.syncPath(localPath, remotePath, options);
    if (status === 0) {
      // Update remote hash
      await this.runHostCommand(
        {
          bin: 'sh',
          args: ['-c', this.quote(`echo ${localHash} > ${remoteHashPath}`)],
        },
        { quiet: true },
      );
    }

    return status;
  }

  public async attachToTmux(
    container: string,
    sessionName: string = 'default',
  ): Promise<number> {
    const attachCmd = `sudo docker exec -it ${container} tmux attach -t ${sessionName} || sudo docker exec -it ${container} /bin/bash`;

    const sshArgs = [
      ...this.getCommonSshArgs(),
      '-t',
      this.getMagicRemote(),
      attachCmd,
    ];

    const res = spawnSync('ssh', sshArgs, { stdio: 'inherit' });
    return res.status ?? (res.error ? 1 : 0);
  }

  private execute(
    bin: string,
    args: string[],
    options: SSHOptions,
  ): ExecResult {
    const res = spawnSync(bin, args, {
      stdio: [
        options.interactive ? 'inherit' : 'ignore',
        options.quiet ? 'pipe' : 'inherit',
        'pipe',
      ],
      shell: false,
      env: { ...process.env, CLOUDSDK_CORE_VERBOSITY: 'error' },
    });

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

    if (stderr && !options.quiet) {
      process.stderr.write(stderr + '\n');
    }

    return {
      status: res.status ?? (res.error ? 1 : 0),
      stdout,
      stderr,
    };
  }

  private getCommonSshArgs(): string[] {
    return [
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      'GlobalKnownHostsFile=/dev/null',
      '-o',
      'CheckHostIP=no',
      '-o',
      'LogLevel=ERROR',
      '-o',
      'ConnectTimeout=60',
      '-o',
      'ServerAliveInterval=30',
      '-o',
      'ServerAliveCountMax=3',
      '-o',
      'ControlMaster=auto',
      '-o',
      'ControlPath=~/.ssh/orbit-%C',
      '-o',
      'ControlPersist=10m',
      '-i',
      `${os.homedir()}/.ssh/google_compute_engine`,
    ];
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
    return `${envPrefix}${cmd.bin} ${cmd.args.join(' ')}`;
  }

  private quote(str: string): string {
    return `'${str.replace(/'/g, "'\\''")}'`;
  }

  private getStandardUser(): string {
    const rawUser = process.env.USER || 'node';
    const userSuffix = this.infra.userSuffix ?? '';
    return `${rawUser}${userSuffix}`;
  }
}

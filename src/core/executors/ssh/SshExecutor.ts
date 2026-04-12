/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { type Command } from '../types.js';
import {
  type IRunOptions,
  type IProcessManager,
  type IProcessResult,
} from '../../interfaces.js';

/**
 * SshExecutor: Managed execution of remote commands via raw SSH.
 * Adheres to "No IAP" and "Direct SSH" mandates.
 */
export interface ISshExecutor {
  exec(target: string, command: string, options?: IRunOptions): IProcessResult;
  execAsync(
    target: string,
    command: string,
    options?: IRunOptions,
  ): Promise<IProcessResult>;
  create(target: string, command: string, options?: IRunOptions): Command;
  copyTo(
    target: string,
    localPath: string,
    remotePath: string,
    options?: {
      quiet?: boolean;
      directory?: boolean;
    },
  ): IProcessResult;
}

export class SshExecutor implements ISshExecutor {
  constructor(private readonly pm: IProcessManager) {}

  public exec(
    target: string,
    command: string,
    options: IRunOptions = {},
  ): IProcessResult {
    const cmd = this.create(target, command, options);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options);
  }

  public async execAsync(
    target: string,
    command: string,
    options: IRunOptions = {},
  ): Promise<IProcessResult> {
    const cmd = this.create(target, command, options);
    return this.pm.run(cmd.bin, cmd.args, cmd.options);
  }

  public create(
    target: string,
    command: string,
    options: IRunOptions = {},
  ): Command {
    const args = [
      ...this.getCommonArgs(),
      options.interactive ? '-t' : '',
      target,
      command,
    ].filter(Boolean);

    const runOptions: IRunOptions = { ...options };
    if (options.interactive) {
      runOptions.stdio = 'inherit';
    }

    return {
      bin: 'ssh',
      args,
      options: runOptions,
    };
  }

  public copyTo(
    target: string,
    localPath: string,
    remotePath: string,
    options: {
      quiet?: boolean;
      directory?: boolean;
    } = {},
  ): IProcessResult {
    const runOptions: IRunOptions = {
      stdio: options.quiet ? 'pipe' : 'inherit',
    };
    if (options.quiet !== undefined) {
      runOptions.quiet = options.quiet;
    }

    if (!options.directory) {
      return this.pm.runSync(
        'scp',
        [...this.getCommonArgs(), localPath, `${target}:${remotePath}`],
        runOptions,
      );
    }

    const trimmedSource = localPath.replace(/[\\/]+$/, '');
    const archivePath = path.join(
      os.tmpdir(),
      `orbit-sync-${Date.now()}-${Math.random().toString(16).slice(2)}.tar`,
    );
    const sourceDir = trimmedSource || localPath;

    try {
      const tar = this.pm.runSync(
        'tar',
        ['-cf', archivePath, '-C', sourceDir, '.'],
        {
          ...runOptions,
          stdio: 'pipe',
          quiet: true,
        },
      );
      if (tar.status !== 0) {
        return tar;
      }

      const remoteArchivePath = `/tmp/${path.posix.basename(archivePath)}`;
      const upload = this.pm.runSync(
        'scp',
        [
          ...this.getCommonArgs(),
          archivePath,
          `${target}:${remoteArchivePath}`,
        ],
        runOptions,
      );
      if (upload.status !== 0) {
        return upload;
      }

      return this.exec(
        target,
        `tar -xf '${remoteArchivePath.replace(/'/g, "'\\''")}' -C '${remotePath.replace(/'/g, "'\\''")}' && rm -f '${remoteArchivePath.replace(/'/g, "'\\''")}'`,
        runOptions,
      );
    } finally {
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }
    }
  }

  protected getCommonArgs(): string[] {
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
}

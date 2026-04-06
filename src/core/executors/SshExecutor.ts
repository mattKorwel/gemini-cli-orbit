/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import { type Command } from './types.js';
import {
  type IRunOptions,
  type IProcessManager,
  type IProcessResult,
} from '../interfaces.js';

/**
 * SshExecutor: Managed execution of remote commands via raw SSH.
 * Adheres to "No IAP" and "Direct SSH" mandates.
 */
export interface ISshExecutor {
  exec(target: string, command: string, options?: IRunOptions): IProcessResult;
  create(target: string, command: string, options?: IRunOptions): Command;
  rsync(
    local: string,
    remote: string,
    options?: {
      delete?: boolean;
      sudo?: boolean;
      exclude?: string[];
      quiet?: boolean;
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

  public rsync(
    local: string,
    remote: string,
    options: {
      delete?: boolean;
      sudo?: boolean;
      exclude?: string[];
      quiet?: boolean;
    } = {},
  ): IProcessResult {
    const sshCmd = `ssh ${this.getCommonArgs().join(' ')}`;
    const args = ['-avz'];

    if (options.delete) args.push('--delete');
    if (options.exclude) {
      options.exclude.forEach((pattern) => args.push('--exclude', pattern));
    }
    if (options.sudo) {
      args.push('--rsync-path', 'sudo rsync');
    }

    args.push('-e', sshCmd);
    args.push(local, remote);

    return this.pm.runSync('rsync', args, {
      stdio: options.quiet ? 'pipe' : 'inherit',
      quiet: options.quiet,
    });
  }

  private getCommonArgs(): string[] {
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

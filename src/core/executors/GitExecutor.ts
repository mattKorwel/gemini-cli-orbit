/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Command } from './types.js';
import {
  type IRunOptions,
  type IGitExecutor,
  type IProcessManager,
  type IProcessResult,
} from '../interfaces.js';

/**
 * GitExecutor: High-level wrapper for Git commands.
 */
export class GitExecutor implements IGitExecutor {
  constructor(private readonly pm: IProcessManager) {}

  public init(cwd: string, options: IRunOptions = {}): IProcessResult {
    const cmd = GitExecutor.init(cwd, options);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options);
  }

  public remoteAdd(
    cwd: string,
    name: string,
    url: string,
    options: IRunOptions = {},
  ): IProcessResult {
    const cmd = GitExecutor.remoteAdd(cwd, name, url, options);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options);
  }

  public fetch(
    cwd: string,
    remote: string,
    branch: string,
    options: IRunOptions = {},
  ): IProcessResult {
    const cmd = GitExecutor.fetch(cwd, remote, branch, options);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options);
  }

  public checkout(
    cwd: string,
    branch: string,
    options: IRunOptions = {},
  ): IProcessResult {
    const cmd = GitExecutor.checkout(cwd, branch, options);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options);
  }

  public checkoutNew(
    cwd: string,
    branch: string,
    base?: string,
    options: IRunOptions = {},
  ): IProcessResult {
    const cmd = GitExecutor.checkoutNew(cwd, branch, base, options);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options);
  }

  public worktreeAdd(
    cwd: string,
    path: string,
    branch: string,
    options: IRunOptions = {},
  ): IProcessResult {
    const cmd = GitExecutor.worktreeAdd(cwd, path, branch, options);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options);
  }

  public verify(
    cwd: string,
    branch: string,
    options: IRunOptions = {},
  ): IProcessResult {
    const cmd = GitExecutor.verify(cwd, branch, options);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options);
  }

  /**
   * Instance-based revParse that uses the injected ProcessManager.
   */
  public revParse(
    cwd: string,
    args: string[],
    options: IRunOptions = {},
  ): IProcessResult {
    const cmd = GitExecutor.revParse(cwd, args, options);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options);
  }

  // --- Static Metadata Helpers (Can remain for dry-runs/string building) ---

  public static init(cwd: string, options: IRunOptions = {}): Command {
    return {
      bin: 'git',
      args: ['init'],
      options: { ...options, cwd },
    };
  }

  public static remoteAdd(
    cwd: string,
    name: string,
    url: string,
    options: IRunOptions = {},
  ): Command {
    return {
      bin: 'git',
      args: ['remote', 'add', name, url],
      options: { ...options, cwd },
    };
  }

  public static fetch(
    cwd: string,
    remote: string,
    branch: string,
    options: IRunOptions = {},
  ): Command {
    const args = ['fetch'];
    if (options.quiet) args.push('--quiet');
    args.push('--depth=1', remote, branch);

    return {
      bin: 'git',
      args,
      options: { ...options, cwd },
    };
  }

  public static checkout(
    cwd: string,
    branch: string,
    options: IRunOptions = {},
  ): Command {
    return {
      bin: 'git',
      args: ['checkout', branch],
      options: { ...options, cwd },
    };
  }

  public static checkoutNew(
    cwd: string,
    branch: string,
    base?: string,
    options: IRunOptions = {},
  ): Command {
    const args = ['checkout', '-b', branch];
    if (base) args.push(base);

    return {
      bin: 'git',
      args,
      options: { ...options, cwd },
    };
  }

  public static worktreeAdd(
    cwd: string,
    path: string,
    branch: string,
    options: IRunOptions = {},
  ): Command {
    return {
      bin: 'git',
      args: ['worktree', 'add', path, branch],
      options: { ...options, cwd },
    };
  }

  public static verify(
    cwd: string,
    branch: string,
    options: IRunOptions = {},
  ): Command {
    return {
      bin: 'git',
      args: ['rev-parse', '--verify', branch],
      options: { ...options, cwd },
    };
  }

  public static revParse(
    cwd: string,
    args: string[],
    options: IRunOptions = {},
  ): Command {
    return {
      bin: 'git',
      args: ['rev-parse', ...args],
      options: { ...options, cwd },
    };
  }
}

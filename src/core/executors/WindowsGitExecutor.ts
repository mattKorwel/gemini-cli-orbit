/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import {
  type IProcessManager,
  type IProcessResult,
  type IRunOptions,
} from '../interfaces.js';
import { type Command } from './types.js';

/**
 * WindowsGitExecutor: resolves git.exe to an absolute path so Node spawnSync
 * does not rely on PATHEXT/PATH lookup behavior.
 *
 * This is intentionally local-use only. It should be injected only into
 * Windows local-worktree flows until the broader Git executor contract is
 * revisited.
 */
export class WindowsGitExecutor {
  private static resolvedBin: string | null = null;

  constructor(private readonly pm: IProcessManager) {}

  private get bin(): string {
    if (process.env.ORBIT_GIT_BIN) {
      return process.env.ORBIT_GIT_BIN;
    }

    if (WindowsGitExecutor.resolvedBin) {
      return WindowsGitExecutor.resolvedBin;
    }

    const lookup = spawnSync('where.exe', ['git'], {
      stdio: 'pipe',
      shell: false,
    });

    if (lookup.status === 0) {
      const resolved = lookup.stdout
        .toString()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (resolved) {
        WindowsGitExecutor.resolvedBin = resolved;
        return resolved;
      }
    }

    WindowsGitExecutor.resolvedBin = 'git.exe';
    return WindowsGitExecutor.resolvedBin;
  }

  public command(args: string[], options: IRunOptions = {}): Command {
    return {
      bin: this.bin,
      args,
      options,
    };
  }

  public runSync(args: string[], options: IRunOptions = {}): IProcessResult {
    const cmd = this.command(args, options);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options);
  }
}

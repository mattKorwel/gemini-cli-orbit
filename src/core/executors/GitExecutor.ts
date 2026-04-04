/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Command } from './types.js';
import { type RunOptions } from '../ProcessManager.js';

export class GitExecutor {
  public static init(cwd: string, options: RunOptions = {}): Command {
    return { bin: 'git', args: ['init'], options: { ...options, cwd } };
  }

  public static remoteAdd(
    cwd: string,
    name: string,
    url: string,
    options: RunOptions = {},
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
    options: RunOptions = {},
  ): Command {
    return {
      bin: 'git',
      args: [
        'fetch',
        '--depth=1',
        remote,
        `refs/heads/${branch}:refs/heads/${branch}`,
      ],
      options: { ...options, cwd },
    };
  }

  public static checkout(
    cwd: string,
    branch: string,
    options: RunOptions = {},
  ): Command {
    return {
      bin: 'git',
      args: ['checkout', branch],
      options: { ...options, cwd },
    };
  }

  public static worktreeAdd(
    cwd: string,
    path: string,
    branch: string,
    options: RunOptions = {},
  ): Command {
    return {
      bin: 'git',
      args: ['worktree', 'add', path, branch],
      options: { ...options, cwd },
    };
  }
}

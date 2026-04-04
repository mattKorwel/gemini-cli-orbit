/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Command } from './types.js';
import { type IRunOptions } from '../interfaces.js';

export class TmuxExecutor {
  /**
   * Wraps a command in a new tmux session.
   */
  public static wrap(
    sessionName: string,
    innerCommand: string,
    options: IRunOptions & { detached?: boolean } = {},
  ): Command {
    const { detached = true, cwd, env } = options;

    const tmuxArgs = [
      'new-session',
      detached ? '-d' : '',
      '-A', // Attach if exists
      '-s',
      sessionName,
    ].filter(Boolean);

    // Build the final command string to run inside tmux
    const envPrefix = env
      ? Object.entries(env)
          .map(([k, v]) => `${k}='${v}'`)
          .join(' ') + ' '
      : '';
    const cdPrefix = cwd ? `cd '${cwd}' && ` : '';
    const fullInner = `${cdPrefix}${envPrefix}${innerCommand}; exec zsh`;

    tmuxArgs.push(fullInner);

    const runOptions: IRunOptions = { ...options };
    delete runOptions.env; // Env is handled inside the wrapper

    return {
      bin: 'tmux',
      args: tmuxArgs,
      options: runOptions,
    };
  }

  public static attach(sessionName: string): Command {
    return {
      bin: 'tmux',
      args: ['attach-session', '-t', sessionName],
      options: { interactive: true },
    };
  }
}

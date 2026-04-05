/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Command } from './types.js';
import { type IRunOptions } from '../interfaces.js';

export class TmuxExecutor {
  /**
   * Wraps an Orbit mission command in a professional, styled tmux session.
   * This is the single source of truth for the Orbit terminal environment.
   */
  public static wrapMission(
    sessionName: string,
    innerCommand: string,
    options: IRunOptions = {},
  ): Command {
    const { cwd, env } = options;

    // 1. Stealth UI Style Definitions
    // We apply these via -c to ensures they hit the session immediately on creation.
    const styles = [
      'set-option status on',
      'set-option status-position top',
      'set-option status-style "bg=colour235,fg=colour244"',
      'set-option status-left "#[fg=colour39,bold] 🛰️  ORBIT #[fg=colour244]┃ "',
      'set-option status-right "#[fg=colour244] #H "',
      'set-option window-status-current-format "#[fg=colour45,bold] #S "',
    ]
      .map((s) => `tmux ${s}`)
      .join('; ');

    // 2. Pro Tip (ANSI: \x1b[38;5;244m = Gray, \x1b[38;5;39m = Blue, \x1b[0m = Reset)
    const tip =
      'printf "\\n   \\x1b[38;5;244m💡 Tip: Press \\x1b[38;5;39mCtrl-b d\\x1b[38;5;244m to detach and keep mission running.\\x1b[0m\\n\\n"';

    // 3. Execution Environment
    const envPrefix = env
      ? Object.entries(env)
          .map(([k, v]) => `${k}='${v}'`)
          .join(' ') + ' '
      : '';
    const cdPrefix = cwd ? `cd '${cwd}' && ` : '';

    // 4. Combined Launch Script
    // If Gemini exits 0 (intentional exit), the session ends.
    // If non-zero (crash), we keep it open for logs.
    const fullLaunch = `${styles}; ${tip}; ${cdPrefix}${envPrefix}${innerCommand} || exec zsh`;

    return {
      bin: 'tmux',
      args: ['new-session', '-d', '-A', '-s', sessionName, fullLaunch],
      options: { ...options, env: {} }, // Env is handled in prefix
    };
  }

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

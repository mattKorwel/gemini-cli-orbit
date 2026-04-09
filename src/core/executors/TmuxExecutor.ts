/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Command } from './types.js';
import {
  type IRunOptions,
  type ITmuxExecutor,
  type IProcessManager,
  type IProcessResult,
} from '../interfaces.js';

export class TmuxExecutor implements ITmuxExecutor {
  constructor(private readonly pm: IProcessManager) {}

  /**
   * Wraps an Orbit mission command in a professional, styled tmux session.
   * This is metadata-only (Returns a command for execution elsewhere).
   */
  public wrapMission(
    sessionName: string,
    innerCommand: string,
    options: IRunOptions = {},
  ): Command {
    return TmuxExecutor.wrapMission(sessionName, innerCommand, options);
  }

  /**
   * Wraps a command in a new tmux session.
   * This is metadata-only (Returns a command for execution elsewhere).
   */
  public wrap(
    sessionName: string,
    innerCommand: string,
    options: IRunOptions & { detached?: boolean } = {},
  ): Command {
    return TmuxExecutor.wrap(sessionName, innerCommand, options);
  }

  /**
   * Directly attaches to an existing session.
   */
  public attach(sessionName: string): IProcessResult {
    const cmd = TmuxExecutor.attach(sessionName);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options);
  }

  // --- Static Metadata Helpers ---

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
    const styles = [
      'set-option status on',
      'set-option status-position top',
      'set-option status-style "bg=colour235,fg=colour244"',
      'set-option status-left "#[fg=colour39,bold] 🛰️  ORBIT #[fg=colour244]┃ "',
      'set-option status-right "#[fg=colour244] #H "',
      'set-option window-status-current-format "#[fg=colour45,bold] #S "',
      'set-option -ga terminal-overrides ",xterm-256color:Tc"',
      'set-option -as terminal-features ",xterm-256color:RGB"',
      'set-option -g default-terminal "xterm-256color"',
    ]
      .map((s) => `tmux ${s}`)
      .join('; ');

    // 2. Pro Tip (ANSI: \x1b[38;5;244m = Gray, \x1b[38;5;39m = Blue, \x1b[0m = Reset)
    const tip =
      'printf "\\n   \\x1b[38;5;244m💡 Tip: Press \\x1b[38;5;39mCtrl-b d\\x1b[38;5;244m to detach and keep mission running.\\x1b[0m\\n\\n"';

    // 3. Execution Environment
    const mergedEnv = {
      COLORTERM: 'truecolor',
      FORCE_COLOR: '3',
      TERM: 'xterm-256color',
      ...(process.env.TERM_PROGRAM
        ? { TERM_PROGRAM: process.env.TERM_PROGRAM }
        : {}),
      ...(env || {}),
    };

    const envPrefix =
      Object.entries(mergedEnv)
        .map(([k, v]) => `export ${k}=${TmuxExecutor.shellQuote(v as string)}`)
        .join('; ') + '; ';
    const cdPrefix = cwd ? `cd ${TmuxExecutor.shellQuote(cwd)} && ` : '';

    // 4. Combined Launch Script
    // If command succeeds (exit 0), the session ends.
    // If it fails (non-zero), we drop into bash for debugging.
    const fullLaunch = `${styles}; ${tip}; ${cdPrefix}${envPrefix}${innerCommand} || exec bash`;

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
    const mergedEnv = {
      COLORTERM: 'truecolor',
      FORCE_COLOR: '3',
      TERM: 'xterm-256color',
      ...(process.env.TERM_PROGRAM
        ? { TERM_PROGRAM: process.env.TERM_PROGRAM }
        : {}),
      ...(env || {}),
    };

    const envPrefix =
      Object.entries(mergedEnv)
        .map(([k, v]) => `export ${k}=${TmuxExecutor.shellQuote(v as string)}`)
        .join('; ') + '; ';
    const cdPrefix = cwd ? `cd ${TmuxExecutor.shellQuote(cwd)} && ` : '';
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

  /**
   * Safe shell quoting for environment variables and paths.
   */
  private static shellQuote(val: string): string {
    return `'${val.replace(/'/g, "'\\''")}'`;
  }
}

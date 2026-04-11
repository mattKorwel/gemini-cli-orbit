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

/**
 * TmuxExecutor: Standard Linux implementation of tmux orchestration.
 */
export class TmuxExecutor implements ITmuxExecutor {
  constructor(protected readonly pm: IProcessManager) {}

  protected get bin(): string {
    return process.env.ORBIT_TMUX_BIN || 'tmux';
  }

  public wrapMission(
    sessionName: string,
    innerCommand: string,
    options: IRunOptions = {},
  ): Command {
    const { cwd, env } = options;
    const binName = this.bin;

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
      .map((s) => `${binName} ${s}`)
      .join('; ');

    // 2. Pro Tip
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
        .map(([k, v]) => `export ${k}=${this.shellQuote(v as string)}`)
        .join('; ') + '; ';
    const cdPrefix = cwd ? `cd ${this.shellQuote(cwd)} && ` : '';

    const fullLaunch = `${styles}; ${tip}; ${cdPrefix}${envPrefix}${innerCommand} || exec bash`;

    return {
      bin: binName,
      args: ['new-session', '-d', '-A', '-s', sessionName, fullLaunch],
      options: { ...options, env: {} },
    };
  }

  public wrap(
    sessionName: string,
    innerCommand: string,
    options: IRunOptions & { detached?: boolean } = {},
  ): Command {
    const { detached = true, cwd, env } = options;

    const tmuxArgs = [
      'new-session',
      detached ? '-d' : '',
      '-A',
      '-s',
      sessionName,
    ].filter(Boolean);

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
        .map(([k, v]) => `export ${k}=${this.shellQuote(v as string)}`)
        .join('; ') + '; ';
    const cdPrefix = cwd ? `cd ${this.shellQuote(cwd)} && ` : '';
    const fullInner = `${cdPrefix}${envPrefix}${innerCommand}; exec zsh`;

    tmuxArgs.push(fullInner);

    const runOptions: IRunOptions = { ...options };
    delete runOptions.env;

    return {
      bin: this.bin,
      args: tmuxArgs,
      options: runOptions,
    };
  }

  public attach(sessionName: string): IProcessResult {
    const cmd = this.getAttachCommand(sessionName);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options);
  }

  protected getAttachCommand(sessionName: string): Command {
    return {
      bin: this.bin,
      args: ['attach-session', '-t', sessionName],
      options: { interactive: true },
    };
  }

  public hasSession(sessionName: string): Command {
    return {
      bin: this.bin,
      args: ['has-session', '-t', sessionName],
      options: { quiet: true },
    };
  }

  public killSession(sessionName: string): Command {
    return {
      bin: this.bin,
      args: ['kill-session', '-t', sessionName],
      options: { quiet: true },
    };
  }

  public listSessions(): Command {
    return {
      bin: this.bin,
      args: ['list-sessions', '-F', '#S'],
      options: { quiet: true },
    };
  }

  public capturePane(sessionName: string): Command {
    return {
      bin: this.bin,
      args: ['capture-pane', '-pt', sessionName],
      options: { quiet: true },
    };
  }

  public version(): Command {
    return {
      bin: this.bin,
      args: ['-V'],
      options: { quiet: true },
    };
  }

  protected shellQuote(val: string): string {
    return `'${val.replace(/'/g, "'\\''")}'`;
  }
}

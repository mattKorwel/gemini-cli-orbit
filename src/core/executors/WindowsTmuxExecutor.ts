/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import { type Command } from './types.js';
import { type IRunOptions } from '../interfaces.js';
import { TmuxExecutor } from './TmuxExecutor.js';

/**
 * WindowsTmuxExecutor: Specialized implementation for Windows environments (psmux).
 * Uses Base64 EncodedCommand to bypass PowerShell profile/policy issues.
 */
export class WindowsTmuxExecutor extends TmuxExecutor {
  private static resolvedBin: string | null = null;

  protected override get bin(): string {
    if (process.env.ORBIT_TMUX_BIN) {
      const baseBin = process.env.ORBIT_TMUX_BIN;
      return baseBin.endsWith('.exe') ? baseBin : `${baseBin}.exe`;
    }

    if (WindowsTmuxExecutor.resolvedBin) {
      return WindowsTmuxExecutor.resolvedBin;
    }

    const lookup = spawnSync('where.exe', ['tmux'], {
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
        WindowsTmuxExecutor.resolvedBin = resolved;
        return resolved;
      }
    }

    WindowsTmuxExecutor.resolvedBin = 'tmux.exe';
    return WindowsTmuxExecutor.resolvedBin;
  }

  private normalizeSession(name: string): string {
    return name.replace(/\//g, '-');
  }

  protected override shellQuote(val: string): string {
    // PowerShell single-quote escaping: double the single quotes
    return `'${val.replace(/'/g, "''")}'`;
  }

  /**
   * Wraps a command string into a Base64 EncodedCommand for PowerShell.
   * This is the most robust way to bypass profiles, policies, and quoting issues.
   */
  private pwshEncode(cmd: string): string {
    // UTF-16LE is required for EncodedCommand
    const buffer = Buffer.from(cmd, 'utf16le');
    const base64 = buffer.toString('base64');
    return `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${base64}`;
  }

  public override wrapMission(
    sessionName: string,
    innerCommand: string,
    options: IRunOptions = {},
  ): Command {
    const { cwd, env } = options;
    const binName = this.bin;
    const tmuxBin = this.shellQuote(binName);
    const normalizedSession = this.normalizeSession(sessionName);

    // 1. Tmux Style Definitions
    const styles = [
      'set-option status on',
      'set-option status-position top',
      'set-option status-style "bg=colour235,fg=colour244"',
      'set-option status-left "#[fg=colour39,bold] 🛰️  ORBIT #[fg=colour244]┃ "',
      'set-option status-right "#[fg=colour244] #H "',
      'set-option window-status-current-format "#[fg=colour45,bold] #S "',
    ]
      .map((s) => `${tmuxBin} ${s}`)
      .join('; ');

    // 2. PWSH Tip
    const tip =
      'Write-Host "`n   `x1b[38;5;244m💡 Tip: Press `x1b[38;5;39mCtrl-b d`x1b[38;5;244m to detach and keep mission running.`x1b[0m`n"';

    // 3. PWSH Environment & Execution
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
        .map(([k, v]) => `$env:${k}=${this.shellQuote(v as string)}`)
        .join('; ') + '; ';

    const cdPrefix = cwd ? `Set-Location ${this.shellQuote(cwd)}; ` : '';

    // 4. Combined PWSH Launch
    const script = `${styles}; ${tip}; ${cdPrefix}${envPrefix}${innerCommand}; Start-Sleep -Seconds 10`;

    // Use EncodedCommand to bypass all policy/profile issues
    const fullLaunch = this.pwshEncode(script);

    return {
      bin: binName,
      args: ['new-session', '-d', '-A', '-s', normalizedSession, fullLaunch],
      options: { ...options, env: {} },
    };
  }

  public override wrap(
    sessionName: string,
    innerCommand: string,
    options: IRunOptions & { detached?: boolean } = {},
  ): Command {
    const { detached = true, cwd, env } = options;
    const binName = this.bin;
    const normalizedSession = this.normalizeSession(sessionName);

    const tmuxArgs = [
      'new-session',
      detached ? '-d' : '',
      '-A',
      '-s',
      normalizedSession,
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
        .map(([k, v]) => `$env:${k}=${this.shellQuote(v as string)}`)
        .join('; ') + '; ';

    const cdPrefix = cwd ? `Set-Location ${this.shellQuote(cwd)}; ` : '';
    const script = `${cdPrefix}${envPrefix}${innerCommand}; powershell.exe -NoProfile -ExecutionPolicy Bypass`;

    tmuxArgs.push(this.pwshEncode(script));

    const runOptions: IRunOptions = { ...options };
    delete runOptions.env;

    return {
      bin: binName,
      args: tmuxArgs,
      options: runOptions,
    };
  }

  public override attach(
    sessionName: string,
  ): import('../interfaces.js').IProcessResult {
    return super.attach(this.normalizeSession(sessionName));
  }

  public override hasSession(sessionName: string): Command {
    return super.hasSession(this.normalizeSession(sessionName));
  }

  public override killSession(sessionName: string): Command {
    return super.killSession(this.normalizeSession(sessionName));
  }

  public override capturePane(sessionName: string): Command {
    return super.capturePane(this.normalizeSession(sessionName));
  }
}

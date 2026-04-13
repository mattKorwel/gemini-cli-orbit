/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TmuxExecutor } from './TmuxExecutor.js';
import { ProcessManager } from '../ProcessManager.js';

describe('TmuxExecutor', () => {
  const expectedBin = 'tmux';
  const executor = new TmuxExecutor(new ProcessManager());

  it('wraps a command correctly', () => {
    process.env.TERM_PROGRAM = 'myterm';
    process.env.TERM_PROGRAM_VERSION = '1.0.0';
    process.env.WT_SESSION = 'wt-123';
    const cmd = executor.wrap('mysession', 'ls -la', { cwd: '/tmp' });
    expect(cmd.bin).toBe(expectedBin);
    expect(cmd.args).toContain('mysession');
    const lastArg = cmd.args[cmd.args.length - 1];
    expect(lastArg).toContain("cd '/tmp'");
    expect(lastArg).toContain("export COLORTERM='truecolor'");
    expect(lastArg).toContain("export FORCE_COLOR='3'");
    expect(lastArg).toContain("export TERM='xterm-256color'");
    expect(lastArg).toContain("export TERM_PROGRAM='myterm'");
    expect(lastArg).toContain("export TERM_PROGRAM_VERSION='1.0.0'");
    expect(lastArg).toContain("export WT_SESSION='wt-123'");
    expect(lastArg).toContain('ls -la; exec zsh');
  });

  it('handles shell quoting in wrap', () => {
    process.env.TERM_PROGRAM = 'myterm';
    const cmd = executor.wrap('mysession', 'ls', {
      cwd: "/path/with'quotes",
      env: { VAR: "val'with'quotes" },
    });
    const lastArg = cmd.args[cmd.args.length - 1];
    expect(lastArg).toContain("cd '/path/with'\\''quotes'");
    expect(lastArg).toContain("export VAR='val'\\''with'\\''quotes'");
    expect(lastArg).toContain("export COLORTERM='truecolor'");
    expect(lastArg).toContain("export FORCE_COLOR='3'");
    expect(lastArg).toContain("export TERM_PROGRAM='myterm'");
  });

  it('wraps a mission correctly with wrapMission', () => {
    process.env.TERM_PROGRAM = 'myterm';
    process.env.TERM_PROGRAM_VERSION = '1.0.0';
    process.env.WT_SESSION = 'wt-123';
    const cmd = executor.wrapMission('mysession', 'node mission.js', {
      cwd: '/tmp',
      env: { VERBOSE: '1' },
    });
    expect(cmd.bin).toBe(expectedBin);
    expect(cmd.args).toContain('mysession');
    const lastArg = cmd.args[cmd.args.length - 1];
    expect(lastArg).toContain('🛰️  ORBIT');
    expect(lastArg).toContain('terminal-overrides');
    expect(lastArg).toContain('terminal-features');
    expect(lastArg).toContain('RGB');
    expect(lastArg).toContain('Tc');
    expect(lastArg).not.toContain('set-environment');
    expect(lastArg).toContain("export COLORTERM='truecolor'");
    expect(lastArg).toContain("export FORCE_COLOR='3'");
    expect(lastArg).toContain("export TERM='xterm-256color'");
    expect(lastArg).toContain("export TERM_PROGRAM='myterm'");
    expect(lastArg).toContain("export TERM_PROGRAM_VERSION='1.0.0'");
    expect(lastArg).toContain("export WT_SESSION='wt-123'");
    expect(lastArg).toContain("cd '/tmp'");
    expect(lastArg).toContain("export VERBOSE='1'");
    expect(lastArg).toContain('node mission.js');
  });

  it('handles complex quoting in wrapMission', () => {
    const cmd = executor.wrapMission('mysession', 'node', {
      env: { MANIFEST: '{"branch":"feat/can\'t-fail"}' },
    });
    const lastArg = cmd.args[cmd.args.length - 1];
    expect(lastArg).toContain(
      "MANIFEST='{\"branch\":\"feat/can'\\''t-fail\"}'",
    );
  });

  it('creates an attach command', () => {
    const pm = {
      runSync: (bin: string, args: string[], options?: any) => ({
        status: 0,
        stdout: JSON.stringify({ bin, args, options }),
        stderr: '',
      }),
    } as any;
    const attachExecutor = new TmuxExecutor(pm);
    const result = attachExecutor.attach('mysession');
    const payload = JSON.parse(result.stdout);
    expect(payload.args).toEqual(['attach-session', '-t', 'mysession']);
    expect(payload.options?.interactive).toBe(true);
  });
});

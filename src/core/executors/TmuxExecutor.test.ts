/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TmuxExecutor } from './TmuxExecutor.js';

describe('TmuxExecutor', () => {
  it('wraps a command correctly', () => {
    const cmd = TmuxExecutor.wrap('mysession', 'ls -la', { cwd: '/tmp' });
    expect(cmd.bin).toBe('tmux');
    expect(cmd.args).toContain('mysession');
    expect(cmd.args[cmd.args.length - 1]).toContain(
      "cd '/tmp' && ls -la; exec zsh",
    );
  });

  it('handles shell quoting in wrap', () => {
    const cmd = TmuxExecutor.wrap('mysession', 'ls', {
      cwd: "/path/with'quotes",
      env: { VAR: "val'with'quotes" },
    });
    const lastArg = cmd.args[cmd.args.length - 1];
    expect(lastArg).toContain("cd '/path/with'\\''quotes'");
    expect(lastArg).toContain("VAR='val'\\''with'\\''quotes'");
  });

  it('wraps a mission correctly with wrapMission', () => {
    const cmd = TmuxExecutor.wrapMission('mysession', 'node mission.js', {
      cwd: '/tmp',
      env: { GCLI_ORBIT_MANIFEST: '{"id":"123"}' },
    });
    expect(cmd.bin).toBe('tmux');
    expect(cmd.args).toContain('mysession');
    const lastArg = cmd.args[cmd.args.length - 1];
    expect(lastArg).toContain('🛰️  ORBIT');
    expect(lastArg).toContain("cd '/tmp'");
    expect(lastArg).toContain('GCLI_ORBIT_MANIFEST=\'{"id":"123"}\'');
    expect(lastArg).toContain('node mission.js');
  });

  it('handles complex quoting in wrapMission', () => {
    const cmd = TmuxExecutor.wrapMission('mysession', 'node', {
      env: { MANIFEST: '{"branch":"feat/can\'t-fail"}' },
    });
    const lastArg = cmd.args[cmd.args.length - 1];
    expect(lastArg).toContain(
      "MANIFEST='{\"branch\":\"feat/can'\\''t-fail\"}'",
    );
  });

  it('creates an attach command', () => {
    const cmd = TmuxExecutor.attach('mysession');
    expect(cmd.args).toEqual(['attach-session', '-t', 'mysession']);
    expect(cmd.options?.interactive).toBe(true);
  });
});

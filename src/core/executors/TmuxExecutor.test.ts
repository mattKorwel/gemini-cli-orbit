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

  it('creates an attach command', () => {
    const cmd = TmuxExecutor.attach('mysession');
    expect(cmd.args).toEqual(['attach-session', '-t', 'mysession']);
    expect(cmd.options?.interactive).toBe(true);
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { GitExecutor } from './GitExecutor.js';

describe('GitExecutor', () => {
  it('creates an init command', () => {
    const cmd = GitExecutor.init('/test');
    expect(cmd.bin).toBe('git');
    expect(cmd.args).toEqual(['init']);
    expect(cmd.options?.cwd).toBe('/test');
  });

  it('creates a worktree add command', () => {
    const cmd = GitExecutor.worktreeAdd('/src', '/wt', 'feat');
    expect(cmd.args).toEqual(['worktree', 'add', '/wt', 'feat']);
    expect(cmd.options?.cwd).toBe('/src');
  });
});

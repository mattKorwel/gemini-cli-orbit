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

  it('creates a fetch command with explicit refspec', () => {
    const cmd = GitExecutor.fetch('/test', 'origin', 'feat/test');
    expect(cmd.args).toEqual([
      'fetch',
      '--depth=1',
      'origin',
      'refs/heads/feat/test:refs/heads/feat/test',
    ]);
  });

  it('creates a checkout command', () => {
    const cmd = GitExecutor.checkout('/test', 'feat/test');
    expect(cmd.args).toEqual(['checkout', 'feat/test']);
  });
});

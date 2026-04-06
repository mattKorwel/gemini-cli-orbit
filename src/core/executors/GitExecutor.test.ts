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

  it('creates a fetch command', () => {
    const cmd = GitExecutor.fetch('/test', 'origin', 'feat/test');
    expect(cmd.args).toEqual(['fetch', '--depth=1', 'origin', 'feat/test']);
  });

  it('creates a rev-parse command', () => {
    const cmd = GitExecutor.revParse('/test', ['--abbrev-ref', 'HEAD']);
    expect(cmd.args).toEqual(['rev-parse', '--abbrev-ref', 'HEAD']);
    expect(cmd.options?.cwd).toBe('/test');
  });

  it('creates a verify command', () => {
    const cmd = GitExecutor.verify('/test', 'feat/test');
    expect(cmd.args).toEqual(['rev-parse', '--verify', 'feat/test']);
    expect(cmd.options?.cwd).toBe('/test');
  });

  it('creates a checkout command', () => {
    const cmd = GitExecutor.checkout('/test', 'feat/test');
    expect(cmd.args).toEqual(['checkout', 'feat/test']);
  });

  it('creates a checkoutNew command (No base)', () => {
    const cmd = GitExecutor.checkoutNew('/test', 'new-branch');
    expect(cmd.args).toEqual(['checkout', '-b', 'new-branch']);
  });

  it('creates a checkoutNew command (With base)', () => {
    const cmd = GitExecutor.checkoutNew('/test', 'new-branch', 'origin/main');
    expect(cmd.args).toEqual(['checkout', '-b', 'new-branch', 'origin/main']);
  });
});

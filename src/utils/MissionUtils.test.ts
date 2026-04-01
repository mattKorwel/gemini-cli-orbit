/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolveMissionContext } from './MissionUtils.js';

vi.mock('node:child_process');
vi.mock('../ConfigManager.js', () => ({
  sanitizeName: (name: string) =>
    name.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase(),
}));

describe('MissionUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a branch name directly', () => {
    const ctx = resolveMissionContext('feat-cool-thing', 'review');

    expect(ctx.branchName).toBe('feat-cool-thing');
    expect(ctx.containerName).toBe('gcli-feat-cool-thing-review');
    expect(ctx.sessionName).toBe('orbit-feat-cool-thing');
    expect(ctx.worktreeName).toBe('mission-feat-cool-thing-review');
  });

  it('resolves a PR number to a branch name using gh cli', () => {
    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: 'feat-from-pr',
      stderr: '',
    } as any);

    const ctx = resolveMissionContext('42', 'fix');

    expect(ctx.branchName).toBe('feat-from-pr');
    expect(ctx.containerName).toBe('gcli-42-fix');
    expect(ctx.sessionName).toBe('orbit-feat-from-pr');
    expect(ctx.worktreeName).toBe('mission-42-fix');

    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['pr', 'view', '42']),
      expect.any(Object),
    );
  });

  it('falls back to PR number if gh cli fails', () => {
    (spawnSync as any).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'error',
    } as any);

    const ctx = resolveMissionContext('42', 'review');

    expect(ctx.branchName).toBe('42');
    expect(ctx.containerName).toBe('gcli-42-review');
    expect(ctx.sessionName).toBe('orbit-42');
  });

  it('sanitizes names in the context', () => {
    const ctx = resolveMissionContext('Feature/Cool!Thing', 'review');

    expect(ctx.containerName).toBe('gcli-feature-cool-thing-review');
    expect(ctx.sessionName).toBe('orbit-feature-cool-thing');
  });
});

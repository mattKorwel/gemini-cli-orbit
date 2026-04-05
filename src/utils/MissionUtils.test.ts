/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveMissionContext } from './MissionUtils.js';
import { spawnSync } from 'node:child_process';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

describe('MissionUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve simple mission ID', () => {
    const ctx = resolveMissionContext('test-branch', 'chat', 'test-repo');
    expect(ctx.containerName).toBe('orbit-test-repo-test-branch');
    expect(ctx.workspaceName).toBe('orbit-test-repo-test-branch');
    expect(ctx.sessionName).toBe('orbit/test-repo/test-branch');
  });

  it('should resolve named mission with suffix (id:name)', () => {
    const ctx = resolveMissionContext('123:debug', 'chat', 'test-repo');
    expect(ctx.containerName).toBe('orbit-test-repo-123-debug');
    expect(ctx.workspaceName).toBe('orbit-test-repo-123-debug');
    expect(ctx.sessionName).toBe('orbit/test-repo/123-debug');
  });

  it('should resolve PR metadata using only the base ID', () => {
    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: JSON.stringify({ headRefName: 'feature-branch' }),
    });

    const ctx = resolveMissionContext('123:debug', 'chat', 'test-repo');

    // Verify gh pr view was called with base ID
    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['pr', 'view', '123']),
      expect.any(Object),
    );

    expect(ctx.branchName).toBe('feature-branch');
    expect(ctx.sessionName).toBe('orbit/test-repo/123-debug');
  });

  it('should handle complex suffixes with multiple colons', () => {
    const ctx = resolveMissionContext('123:deep:dive', 'review', 'test-repo');
    expect(ctx.containerName).toBe('orbit-test-repo-123-deep-dive-review');
    expect(ctx.workspaceName).toBe('orbit-test-repo-123-deep-dive');
    expect(ctx.sessionName).toBe('orbit/test-repo/123-deep-dive/review');
  });
});

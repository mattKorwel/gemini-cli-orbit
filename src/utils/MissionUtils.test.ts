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
    const ctx = resolveMissionContext('test-branch', 'chat');
    expect(ctx.containerName).toBe('orbit-test-branch-chat');
    expect(ctx.workspaceName).toBe('mission-test-branch-chat');
  });

  it('should resolve named mission with suffix (id:name)', () => {
    const ctx = resolveMissionContext('123:debug', 'chat');
    expect(ctx.containerName).toBe('orbit-123-debug-chat');
    expect(ctx.workspaceName).toBe('mission-123-debug-chat');
  });

  it('should resolve PR metadata using only the base ID', () => {
    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: 'feature-branch\n',
    });

    const ctx = resolveMissionContext('123:debug', 'chat');

    // Verify gh pr view was called with base ID
    expect(spawnSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['pr', 'view', '123']),
      expect.any(Object),
    );

    expect(ctx.branchName).toBe('feature-branch');
    expect(ctx.sessionName).toBe('orbit-feature-branch-debug');
  });

  it('should handle complex suffixes with multiple colons', () => {
    const ctx = resolveMissionContext('123:deep:dive', 'review');
    expect(ctx.containerName).toBe('orbit-123-deep-dive-review');
    expect(ctx.workspaceName).toBe('mission-123-deep-dive-review');
  });
});

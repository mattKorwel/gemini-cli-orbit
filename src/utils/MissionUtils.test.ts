/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveMissionContext } from './MissionUtils.js';

describe('MissionUtils', () => {
  const mockPm: any = {
    runSync: vi.fn().mockReturnValue({ status: 1, stdout: '', stderr: '' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve metadata and slugs', () => {
    const ctx = resolveMissionContext(
      'test-branch',
      'gemini-cli-orbit',
      mockPm,
    );
    expect(ctx.branchName).toBe('test-branch');
    expect(ctx.repoSlug).toBe('gemini-cli-orbit');
    expect(ctx.idSlug).toBe('test-branch');
  });

  it('should resolve named mission with suffix (id:name)', () => {
    const ctx = resolveMissionContext('123:debug', 'gemini-cli-orbit', mockPm);
    expect(ctx.idSlug).toBe('123');
    expect(ctx.action).toBe('debug');
  });

  it('should resolve PR metadata using GH CLI for numeric IDs', () => {
    const customMockPm = {
      runSync: vi.fn().mockReturnValue({
        status: 0,
        stdout: 'feature-branch',
      }),
    };

    const ctx = resolveMissionContext(
      '123',
      'gemini-cli-orbit',
      customMockPm as any,
    );

    expect(customMockPm.runSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['pr', 'view', '123']),
    );

    expect(ctx.branchName).toBe('feature-branch');
    expect(ctx.idSlug).toBe('123');
  });

  it('should fallback to ID as branch name if GH CLI fails', () => {
    const ctx = resolveMissionContext('123', 'gemini-cli-orbit', mockPm);
    expect(ctx.branchName).toBe('123');
    expect(ctx.idSlug).toBe('123');
  });
});

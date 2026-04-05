/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveMissionContext } from './MissionUtils.js';

describe('MissionUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve simple mission ID', () => {
    const ctx = resolveMissionContext('test-branch', 'chat');
    expect(ctx.containerName).toBe('orbit-test-branch');
    expect(ctx.workspaceName).toBe('orbit-test-branch');
    expect(ctx.sessionName).toBe('orbit-test-branch');
  });

  it('should resolve named mission with suffix (id:name)', () => {
    const ctx = resolveMissionContext('123:debug', 'chat');
    expect(ctx.containerName).toBe('orbit-123-debug');
    expect(ctx.workspaceName).toBe('orbit-123-debug');
    expect(ctx.sessionName).toBe('orbit-123-debug');
  });

  it('should resolve PR metadata using only the base ID', () => {
    const ctx = resolveMissionContext('123', 'review');
    expect(ctx.branchName).toBe('123');
    expect(ctx.workspaceName).toBe('orbit-123');
  });

  it('should handle complex suffixes with multiple colons', () => {
    const ctx = resolveMissionContext('123:deep:dive', 'review');
    expect(ctx.containerName).toBe('orbit-123-deep-dive-review');
    expect(ctx.workspaceName).toBe('orbit-123-deep-dive');
    expect(ctx.sessionName).toBe('orbit-123-deep-dive-review');
  });
});

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

  it('should resolve simple mission ID with hierarchical slugs', () => {
    const ctx = resolveMissionContext('test-branch', 'chat');
    // orbit-<repo>-<id>
    expect(ctx.workspaceName).toBe('orbit-orbit-test-branch');
    expect(ctx.containerName).toBe('orbit-orbit-test-branch');
    // Tmux session uses '/'
    expect(ctx.sessionName).toBe('orbit/orbit/test-branch');
  });

  it('should resolve named mission with suffix (id:name)', () => {
    const ctx = resolveMissionContext('123:debug', 'chat');
    expect(ctx.workspaceName).toBe('orbit-orbit-123-debug');
    expect(ctx.containerName).toBe('orbit-orbit-123-debug');
    expect(ctx.sessionName).toBe('orbit/orbit/123/debug');
  });

  it('should resolve PR metadata using only the base ID', () => {
    const ctx = resolveMissionContext('123', 'review');
    expect(ctx.branchName).toBe('123');
    expect(ctx.workspaceName).toBe('orbit-orbit-123');
    expect(ctx.containerName).toBe('orbit-orbit-123-review');
    expect(ctx.sessionName).toBe('orbit/orbit/123/review');
  });

  it('should handle complex suffixes with multiple colons', () => {
    const ctx = resolveMissionContext('123:deep:dive', 'review');
    expect(ctx.workspaceName).toBe('orbit-orbit-123-deep-dive');
    expect(ctx.containerName).toBe('orbit-orbit-123-deep-dive-review');
    expect(ctx.sessionName).toBe('orbit/orbit/123/deep-dive/review');
  });
});

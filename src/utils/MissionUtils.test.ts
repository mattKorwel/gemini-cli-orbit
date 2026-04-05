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

  it('should resolve metadata and slugs (Preserved)', () => {
    const ctx = resolveMissionContext('test-branch', 'gemini-cli-orbit');
    expect(ctx.branchName).toBe('test-branch');
    expect(ctx.repoSlug).toBe('gemini-cli-orbit');
    expect(ctx.idSlug).toBe('test-branch');
  });

  it('should resolve named mission with suffix (id:name)', () => {
    const ctx = resolveMissionContext('123:debug', 'gemini-cli-orbit');
    expect(ctx.idSlug).toBe('123-debug');
  });

  it('should resolve PR metadata using only the base ID', () => {
    const ctx = resolveMissionContext('123', 'gemini-cli-orbit');
    expect(ctx.branchName).toBe('123');
    expect(ctx.idSlug).toBe('123');
  });
});

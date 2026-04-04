/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { CIManager } from './CIManager.js';
import { type IProcessManager } from '../core/interfaces.js';

describe('CIManager', () => {
  let ci: CIManager;
  let processManager: Mocked<IProcessManager>;
  const observer = { onLog: vi.fn() };
  const projectCtx = { repoRoot: '/repo', repoName: 'test-repo' };

  beforeEach(() => {
    vi.clearAllMocks();
    processManager = {
      runSync: vi.fn(),
    } as any;
    ci = new CIManager(
      projectCtx as any,
      {} as any,
      observer as any,
      processManager,
    );
  });

  it('should monitor CI runs', async () => {
    // Mock git branch
    processManager.runSync.mockImplementation((bin: string, args: string[]) => {
      if (bin === 'git' && args.includes('--show-current')) {
        return { status: 0, stdout: 'main', stderr: '' };
      }
      if (bin === 'git' && args.includes('remote')) {
        return {
          status: 0,
          stdout: 'https://github.com/org/repo.git',
          stderr: '',
        };
      }
      if (bin === 'gh' && args.includes('list')) {
        return {
          status: 0,
          stdout: JSON.stringify([{ databaseId: 123, status: 'completed' }]),
          stderr: '',
        };
      }
      if (bin === 'gh' && args.includes('view')) {
        return {
          status: 0,
          stdout: JSON.stringify({
            status: 'completed',
            conclusion: 'success',
          }),
          stderr: '',
        };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    const status = await ci.monitor({ branch: 'main' });
    expect(status.status).toBe('PASSED');
    expect(status.runs).toContain('123');
  });

  it('should detect failures', async () => {
    processManager.runSync.mockImplementation((bin: string, args: string[]) => {
      if (bin === 'git') return { status: 0, stdout: 'main', stderr: '' };
      if (bin === 'gh' && args.includes('list')) {
        return {
          status: 0,
          stdout: JSON.stringify([{ databaseId: 456, status: 'completed' }]),
          stderr: '',
        };
      }
      if (bin === 'gh' && args.includes('view')) {
        return {
          status: 0,
          stdout: JSON.stringify({
            status: 'completed',
            conclusion: 'failure',
          }),
          stderr: '',
        };
      }
      return { status: 1, stdout: '', stderr: '' };
    });

    const status = await ci.monitor({ branch: 'main' });
    expect(status.status).toBe('FAILED');
  });
});

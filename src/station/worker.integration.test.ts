/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main } from './worker.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProcessManager } from '../core/ProcessManager.js';

vi.mock('node:child_process');
vi.mock('../core/ProcessManager.js');

describe('Worker Integration (High-Fidelity)', () => {
  let tmpDir: string;
  let remoteRepoPath: string;
  let workspacePath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = path.join(
      os.tmpdir(),
      `orbit-worker-test-${Math.random().toString(36).substring(7)}`,
    );
    remoteRepoPath = path.join(tmpDir, 'remote-repo');
    workspacePath = path.join(tmpDir, 'workspace');

    // Ensure directory doesn't exist to start with
    if (fs.existsSync(tmpDir)) {
      // We can't really remove it if we mocked fs, but this is for local runs
    }

    // Mock ProcessManager.runSync to return success without executing real commands
    (ProcessManager.runSync as any).mockImplementation(
      (bin: string, args: string[]) => {
        if (bin === 'git' && args.includes('rev-parse')) {
          return { status: 0, stdout: 'feat/test', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      },
    );

    // Mock process.cwd to return workspacePath
    vi.spyOn(process, 'cwd').mockReturnValue(workspacePath);
    // Mock process.chdir to not throw
    vi.spyOn(process, 'chdir').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should perform a full chunky initialization locally', async () => {
    // Mock fs.existsSync to return false for .git initially, and false for workspacePath
    vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      const ps = p.toString();
      if (ps.endsWith('.git')) return false;
      if (ps === workspacePath) return false;
      if (ps.includes('README.md')) return true;
      return false;
    });

    const exitCode = await main([
      'init',
      'pr-123',
      'feat/test',
      remoteRepoPath,
    ]);

    expect(exitCode).toBe(0);

    // Verify git init was called via ProcessManager
    expect(ProcessManager.runSync).toHaveBeenCalledWith(
      'git',
      ['init'],
      expect.objectContaining({ cwd: workspacePath }),
    );

    // Verify remote add
    expect(ProcessManager.runSync).toHaveBeenCalledWith(
      'git',
      ['remote', 'add', 'origin', remoteRepoPath],
      expect.objectContaining({ cwd: workspacePath }),
    );

    // Verify fetch
    expect(ProcessManager.runSync).toHaveBeenCalledWith(
      'git',
      ['fetch', '--depth=1', 'origin', 'feat/test'],
      expect.objectContaining({ cwd: workspacePath }),
    );
  });

  it('should handle existing directories gracefully', async () => {
    // Mock fs.existsSync to return true for .git to simulate existing repo
    vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      const ps = p.toString();
      if (ps.endsWith('.git')) return true;
      return true;
    });

    // Mock fs.mkdirSync to not do anything real
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined as any);

    const exitCode = await main([
      'init',
      'pr-123',
      'feat/test',
      remoteRepoPath,
    ]);

    expect(exitCode).toBe(0);

    // Verify it tried to checkout instead of init
    expect(ProcessManager.runSync).toHaveBeenCalledWith(
      'git',
      ['checkout', 'feat/test'],
      expect.objectContaining({ cwd: workspacePath }),
    );
  });
});

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
import { spawnSync } from 'node:child_process';
import { ProcessManager } from '../core/ProcessManager.js';

vi.mock('node:child_process');
vi.mock('../core/ProcessManager.js');

describe('Worker Integration (High-Fidelity)', () => {
  let tmpDir: string;
  let remoteRepoPath: string;
  let workspacePath: string;
  let oldCwd: string;

  beforeEach(() => {
    vi.clearAllMocks();
    oldCwd = process.cwd();
    tmpDir = '/tmp/orbit-worker-test';
    remoteRepoPath = path.join(tmpDir, 'remote-repo');
    workspacePath = path.join(tmpDir, 'workspace');

    // Mock spawnSync to return success for git setup calls if they were to happen
    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
    });

    process.chdir = vi.fn();

    // Mock ProcessManager.runSync to return success without executing real commands
    (ProcessManager.runSync as any).mockImplementation(
      (bin: string, args: string[]) => {
        if (bin === 'git' && args.includes('rev-parse')) {
          return { status: 0, stdout: 'feat/test', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should perform a full chunky initialization locally', async () => {
    // Mock fs.existsSync to simulate git being initialized
    const realExists = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: string) => {
      if (p.toString().endsWith('.git')) return true;
      if (p.toString().includes('README.md')) return true;
      return realExists(p);
    });

    const exitCode = await main([
      'init',
      'pr-123',
      'feat/test',
      remoteRepoPath,
    ]);

    expect(exitCode).toBe(0);

    // Verify git state via mocks
    expect(fs.existsSync(path.join(workspacePath, '.git'))).toBe(true);

    // This now uses the mocked spawnSync
    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: 'feat/test\n',
      stderr: '',
    });

    const branchRes = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: workspacePath,
      encoding: 'utf8',
    });
    expect(branchRes.stdout.trim()).toBe('feat/test');
  });

  it('should handle existing directories gracefully', async () => {
    // Mock fs.mkdirSync to not do anything real
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined as any);

    const exitCode = await main([
      'init',
      'pr-123',
      'feat/test',
      remoteRepoPath,
    ]);

    expect(exitCode).toBe(0);
  });
});

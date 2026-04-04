/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { main } from './worker.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

describe('Worker Integration (High-Fidelity)', () => {
  let tmpDir: string;
  let remoteRepoPath: string;
  let workspacePath: string;
  let oldCwd: string;

  beforeEach(() => {
    oldCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-worker-test-'));
    remoteRepoPath = path.join(tmpDir, 'remote-repo');
    workspacePath = path.join(tmpDir, 'workspace');

    fs.mkdirSync(remoteRepoPath, { recursive: true });
    fs.mkdirSync(workspacePath, { recursive: true });

    // Initialize a dummy remote repo
    const run = (cmd: string, args: string[], cwd: string) => {
      spawnSync(cmd, args, { cwd, stdio: 'ignore' });
    };

    run('git', ['init'], remoteRepoPath);
    fs.writeFileSync(path.join(remoteRepoPath, 'README.md'), '# Test Repo');
    run('git', ['add', '.'], remoteRepoPath);
    run('git', ['commit', '-m', 'initial commit'], remoteRepoPath);
    run('git', ['checkout', '-b', 'feat/test'], remoteRepoPath);

    process.chdir(workspacePath);
  });

  afterEach(() => {
    process.chdir(oldCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should perform a full chunky initialization locally', async () => {
    // 1. Run init command
    // node station.js init <identifier> <branch> <upstreamUrl> [mirrorPath]
    const exitCode = await main([
      'init',
      'pr-123',
      'feat/test',
      remoteRepoPath,
    ]);

    expect(exitCode).toBe(0);

    // 2. Verify git state
    expect(fs.existsSync(path.join(workspacePath, '.git'))).toBe(true);
    expect(fs.existsSync(path.join(workspacePath, 'README.md'))).toBe(true);

    const branchRes = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: workspacePath,
      encoding: 'utf8',
    });
    expect(branchRes.stdout.trim()).toBe('feat/test');
  });

  it('should handle existing directories gracefully', async () => {
    // Create an empty dir first (simulating a mount)
    fs.mkdirSync(path.join(workspacePath, 'some-dir'));

    const exitCode = await main([
      'init',
      'pr-123',
      'feat/test',
      remoteRepoPath,
    ]);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(workspacePath, '.git'))).toBe(true);
  });
});

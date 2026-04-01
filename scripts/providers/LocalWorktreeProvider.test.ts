/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalWorktreeProvider } from './LocalWorktreeProvider.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import * as Constants from '../Constants.js';

vi.mock('node:child_process');
vi.mock('node:fs');

describe('LocalWorktreeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Constants, 'getPrimaryRepoRoot').mockReturnValue(
      '/home/node/dev/repo/main',
    );

    // Mock fs.existsSync to true by default for test stability
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // Mock realpathSync to return input by default
    vi.mocked(fs.realpathSync).mockImplementation((p) => p.toString());
  });

  it('should initialize with correct worktrees directory', () => {
    const provider = new LocalWorktreeProvider('test-station', '/tmp/wt');
    expect(provider.worktreesDir).toBe('/tmp/wt');
  });

  it('should fallback to parent of main if default is /mnt/disks/data', () => {
    const provider = new LocalWorktreeProvider(
      'test-station',
      '/mnt/disks/data',
    );
    // /home/node/dev/repo/main -> parent is /home/node/dev/repo
    expect(provider.worktreesDir).toBe('/home/node/dev/repo');
  });

  it('should report RUNNING status', async () => {
    const provider = new LocalWorktreeProvider();
    const status = await provider.getStatus();
    expect(status.status).toBe('RUNNING');
  });

  it('should check for tmux existence', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    const provider = new LocalWorktreeProvider();
    const cmd = provider.getRunCommand('ls');
    expect(cmd).toContain('tmux new-session');
  });

  it('should fallback to raw shell if tmux is missing', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1 } as any);
    const provider = new LocalWorktreeProvider();
    const cmd = provider.getRunCommand('ls');
    expect(cmd).not.toContain('tmux');
    expect(cmd).toContain('cd');
  });

  it('should list worktrees as capsules', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: Buffer.from(
        'worktree /home/node/dev/repo/main\n' +
          'branch refs/heads/main\n\n' +
          'worktree /home/node/dev/repo/feat-1\n' +
          'branch refs/heads/feat-1\n',
      ),
    } as any);

    const provider = new LocalWorktreeProvider('test', '/home/node/dev/repo');
    const capsules = await provider.listCapsules();
    expect(capsules).toContain('feat-1');
    expect(capsules).not.toContain('main');
  });
});

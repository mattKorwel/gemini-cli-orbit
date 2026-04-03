/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalWorktreeProvider } from './LocalWorktreeProvider.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import * as Constants from '../core/Constants.js';

vi.mock('node:child_process');
vi.mock('node:fs');

describe('LocalWorktreeProvider', () => {
  const projectCtx: Constants.ProjectContext = {
    repoRoot: '/home/node/dev/repo/main',
    repoName: 'repo',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Constants, 'getPrimaryRepoRoot').mockReturnValue(
      '/home/node/dev/repo/main',
    );

    // Mock fs.existsSync to true by default for test stability
    (fs.existsSync as any).mockReturnValue(true);
    // Mock realpathSync to return input by default
    (fs.realpathSync as any).mockImplementation((p: string) => p.toString());
  });

  it('should initialize with correct worktrees directory', () => {
    const provider = new LocalWorktreeProvider(
      projectCtx,
      'test-station',
      '/tmp/wt',
    );
    expect(provider.workspacesDir).toBe('/tmp/wt');
  });

  it('should fallback to sibling of main if default is /mnt/disks/data', () => {
    const provider = new LocalWorktreeProvider(
      projectCtx,
      'test-station',
      '/mnt/disks/data',
    );
    // /home/node/dev/repo/main -> sibling is /home/node/dev/repo/workspaces
    expect(provider.workspacesDir).toBe('/home/node/dev/repo/workspaces');
  });

  it('should report RUNNING status', async () => {
    const provider = new LocalWorktreeProvider(projectCtx);
    const status = await provider.getStatus();
    expect(status.status).toBe('RUNNING');
  });

  it('should check for tmux existence', () => {
    (spawnSync as any).mockReturnValue({ status: 0 } as any);
    const provider = new LocalWorktreeProvider(projectCtx);
    const cmd = provider.getRunCommand('ls');
    expect(cmd).toContain('tmux new-session');
  });

  it('should fallback to raw shell if tmux is missing', () => {
    (spawnSync as any).mockReturnValue({ status: 1 } as any);
    const provider = new LocalWorktreeProvider(projectCtx);
    const cmd = provider.getRunCommand('ls');
    expect(cmd).not.toContain('tmux');
    expect(cmd).toContain('cd');
  });

  it('should list worktrees as capsules', async () => {
    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: Buffer.from(
        'worktree /home/node/dev/repo/main\n' +
          'branch refs/heads/main\n\n' +
          'worktree /home/node/dev/repo/worktrees/orbit-feat-1\n' +
          'branch refs/heads/feat-1\n',
      ),
    } as any);

    const provider = new LocalWorktreeProvider(
      projectCtx,
      'test',
      '/home/node/dev/repo/worktrees',
    );
    const capsules = await provider.listCapsules();
    expect(capsules).toContain('orbit-feat-1');
    expect(capsules).not.toContain('main');
  });
});

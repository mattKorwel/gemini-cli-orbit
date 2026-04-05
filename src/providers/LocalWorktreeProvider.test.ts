/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalWorktreeProvider } from './LocalWorktreeProvider.js';
import fs from 'node:fs';
import * as Constants from '../core/Constants.js';

vi.mock('node:fs');

describe('LocalWorktreeProvider', () => {
  const projectCtx: Constants.ProjectContext = {
    repoRoot: '/home/node/dev/repo/main',
    repoName: 'repo',
  };

  const mockPm: any = {
    runSync: vi.fn(),
    runAsync: vi.fn(),
    spawn: vi.fn(),
  };

  const mockExecutors: any = {
    git: {
      fetch: vi.fn(),
      worktreeAdd: vi.fn(),
    },
    tmux: {
      attach: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Constants, 'getPrimaryRepoRoot').mockReturnValue(
      '/home/node/dev/repo/main',
    );

    // Mock fs.existsSync to true by default for test stability
    (fs.existsSync as any).mockReturnValue(true);
    // Mock fs.statSync to return isDirectory: true
    (fs.statSync as any).mockReturnValue({ isDirectory: () => true });
    // Mock readdirSync for listCapsules
    (fs.readdirSync as any).mockReturnValue([]);

    mockPm.runSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });
  });

  it('should initialize with correct hierarchical workspaces directory', () => {
    const provider = new LocalWorktreeProvider(
      projectCtx,
      mockPm,
      mockExecutors,
      'test-station',
    );
    // /home/node/dev/repo/main -> sibling is /home/node/dev/repo/orbit-workspaces
    expect(provider.workspacesDir).toBe('/home/node/dev/repo/orbit-workspaces');
  });

  it('should report RUNNING status', async () => {
    const provider = new LocalWorktreeProvider(
      projectCtx,
      mockPm,
      mockExecutors,
    );
    const status = await provider.getStatus();
    expect(status.status).toBe('RUNNING');
  });

  it('should check for tmux existence', () => {
    mockPm.runSync.mockReturnValue({ status: 0 } as any);
    const provider = new LocalWorktreeProvider(
      projectCtx,
      mockPm,
      mockExecutors,
    );
    const cmd = provider.getRunCommand('ls');
    expect(cmd).toContain('tmux new-session');
  });

  it('should fallback to raw shell if tmux is missing', () => {
    mockPm.runSync.mockReturnValue({ status: 1 } as any);
    const provider = new LocalWorktreeProvider(
      projectCtx,
      mockPm,
      mockExecutors,
    );
    const cmd = provider.getRunCommand('ls');
    expect(cmd).not.toContain('tmux');
    expect(cmd).toContain('cd');
  });

  it('should list hierarchical worktrees as capsules and skip repo root', async () => {
    const workspacesDir = '/home/node/dev/repo/workspaces';
    mockPm.runSync.mockReturnValue({
      status: 0,
      stdout: `worktree ${projectCtx.repoRoot}\nworktree ${workspacesDir}/repo/feat-1\nworktree ${workspacesDir}/repo/feat-2\n`,
      stderr: '',
    });

    const provider = new LocalWorktreeProvider(
      projectCtx,
      mockPm,
      mockExecutors,
      'test',
      workspacesDir,
    );
    const capsules = await provider.listCapsules();
    expect(capsules).toHaveLength(2);
    expect(capsules).toContain('repo/feat-1');
    expect(capsules).toContain('repo/feat-2');
    expect(capsules).not.toContain('/home/node/dev/repo/main');
  });
});

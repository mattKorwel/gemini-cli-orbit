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

  const mockInfra: Constants.InfrastructureSpec = {
    instanceName: 'local-test',
    providerType: 'local-worktree',
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
    node: {
      create: vi.fn().mockReturnValue({ bin: 'node', args: [] }),
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

  it('should initialize and resolve correct workspaces root', () => {
    const provider = new LocalWorktreeProvider(
      projectCtx,
      fs,
      mockPm,
      mockExecutors,
      '/home/node/dev/repo/workspaces',
      mockInfra,
    );
    expect(provider.resolveWorkspacesRoot()).toBe(
      '/home/node/dev/repo/workspaces/repo',
    );
  });

  it('should report RUNNING status', async () => {
    const provider = new LocalWorktreeProvider(
      projectCtx,
      fs,
      mockPm,
      mockExecutors,
      '/tmp/workspaces',
      mockInfra,
    );
    const status = await provider.getStatus();
    expect(status.status).toBe('RUNNING');
  });

  it('should check for tmux existence', () => {
    mockPm.runSync.mockReturnValue({ status: 0 } as any);
    const provider = new LocalWorktreeProvider(
      projectCtx,
      fs,
      mockPm,
      mockExecutors,
      '/tmp/workspaces',
      mockInfra,
    );
    const cmd = provider.getRunCommand('ls');
    expect(cmd).toContain('tmux new-session');
  });

  it('should fallback to raw shell if tmux is missing', () => {
    mockPm.runSync.mockReturnValue({ status: 1 } as any);
    const provider = new LocalWorktreeProvider(
      projectCtx,
      fs,
      mockPm,
      mockExecutors,
      '/tmp/workspaces',
      mockInfra,
    );
    const cmd = provider.getRunCommand('ls');
    expect(cmd).not.toContain('tmux');
    expect(cmd).toContain('cd');
  });

  describe('Robust Provisioning', () => {
    it('should create worktree and write manifest file', async () => {
      mockPm.runSync.mockReturnValue({ status: 0 } as any);
      (fs.existsSync as any).mockReturnValue(false); // Worktree doesn't exist

      const provider = new LocalWorktreeProvider(
        projectCtx,
        fs,
        mockPm,
        mockExecutors,
        '/tmp/workspaces',
        mockInfra,
        { stationName: 'test-station' },
      );

      const mCtx = {
        branchName: 'feat-1',
        repoSlug: 'repo',
        idSlug: 'feat-1',
        workspaceName: 'repo/feat-1',
        containerName: 'repo-feat-1',
        sessionName: 'repo/feat-1',
        action: 'chat',
      };

      await provider.prepareMissionWorkspace(mCtx, {} as any);

      // 1. Should check for branch and create worktree
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['worktree', 'add']),
        expect.any(Object),
      );

      // 2. Should write manifest file
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.orbit-manifest.json'),
        expect.stringContaining('"identifier":"feat-1"'),
      );
    });
  });

  describe('Surgical Jettison', () => {
    it('should remove worktree if last session is jettisoned', async () => {
      mockPm.runSync.mockImplementation((bin: string, args: string[]) => {
        if (bin === 'tmux' && args.includes('list-sessions')) {
          return { status: 0, stdout: 'repo/id2' }; // Another session exists
        }
        return { status: 0, stdout: '' };
      });

      const provider = new LocalWorktreeProvider(
        projectCtx,
        fs,
        mockPm,
        mockExecutors,
        '/tmp/workspaces',
        mockInfra,
      );

      // We need to call with an action to trigger the surgical path
      await provider.jettisonMission('id1', 'fix');

      // Should kill the specific session
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'tmux',
        ['kill-session', '-t', 'repo/id1/fix'],
        expect.anything(),
      );
    });

    it('should remove everything if no action is provided', async () => {
      const provider = new LocalWorktreeProvider(
        projectCtx,
        fs,
        mockPm,
        mockExecutors,
        '/tmp/workspaces',
        mockInfra,
      );

      await provider.jettisonMission('id1');

      // Should remove worktree
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['worktree', 'remove']),
        expect.anything(),
      );

      // Should kill all standard actions
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'tmux',
        ['kill-session', '-t', 'repo/id1'],
        expect.anything(),
      );
    });
  });
});

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
      '/home/node/dev/repo/workspaces',
    );
    expect(provider.workspacesDir).toBe('/home/node/dev/repo/workspaces');
  });

  it('should report RUNNING status', async () => {
    const provider = new LocalWorktreeProvider(
      projectCtx,
      mockPm,
      mockExecutors,
      'local',
      '/tmp/workspaces',
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
      'local',
      '/tmp/workspaces',
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
      'local',
      '/tmp/workspaces',
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
      'test-station',
      workspacesDir,
    );
    const capsules = await provider.listCapsules();
    expect(capsules).toHaveLength(2);
    expect(capsules).toContain('repo/feat-1');
    expect(capsules).toContain('repo/feat-2');
    expect(capsules).not.toContain('/home/node/dev/repo/main');
  });

  it('should fetch mission telemetry from local worker', async () => {
    const provider = new LocalWorktreeProvider(
      projectCtx,
      mockPm,
      mockExecutors,
      'local',
      '/tmp/workspaces',
    );

    mockExecutors.node = {
      create: vi
        .fn()
        .mockReturnValue({ bin: 'node', args: ['station.js', 'status'] }),
    };

    // 1. Mock listCapsules output
    vi.spyOn(provider, 'listCapsules').mockResolvedValue(['repo/id1']);

    // 2. Mock worker status output
    vi.spyOn(provider, 'getExecOutput').mockResolvedValue({
      status: 0,
      stdout: JSON.stringify({
        missions: [
          { mission: 'repo/id1', status: 'THINKING', last_thought: 'Working' },
        ],
      }),
      stderr: '',
    });

    const telemetry = await provider.getMissionTelemetry();
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0]!.name).toBe('repo/id1');
    expect(telemetry[0]!.state).toBe('THINKING');
    expect(telemetry[0]!.lastThought).toBe('Working');
  });

  it('should correctly resolve paths and naming', () => {
    const provider = new LocalWorktreeProvider(
      projectCtx,
      mockPm,
      mockExecutors,
      'test-station',
      '/workspaces',
    );

    expect(provider.resolveWorkDir('repo/id')).toBe('/workspaces/repo/id');
    expect(provider.resolveWorkspacesRoot()).toBe('/workspaces/repo');
    expect(provider.resolveWorkerPath()).toContain('station.js');
    expect(provider.resolveProjectConfigDir()).toBe(
      '/home/node/dev/repo/main/.gemini',
    );
    expect(provider.resolvePolicyPath('/abs/path')).toBe(
      '/abs/path/.gemini/policies/workspace-policy.toml',
    );
    expect(provider.resolveMirrorPath()).toBe('/home/node/dev/repo/main');

    mockExecutors.node = {
      create: vi.fn().mockReturnValue({ bin: 'node', args: [] }),
    };
    provider.createNodeCommand('script.js', ['arg1']);
    expect(mockExecutors.node.create).toHaveBeenCalledWith('script.js', [
      'arg1',
    ]);

    const mCtx = { sessionName: 'repo/id1' } as any;
    expect(provider.resolveIsolationId(mCtx)).toBe('repo/id1');
  });

  describe('Surgical Jettison', () => {
    it('should kill only specific session if action is provided', async () => {
      const provider = new LocalWorktreeProvider(
        projectCtx,
        mockPm,
        mockExecutors,
        'local',
        '/workspaces',
      );

      // Mock other active sessions exist
      mockPm.runSync.mockImplementation((bin: string, args: string[]) => {
        if (bin === 'tmux' && args[0] === 'list-sessions') {
          return { status: 0, stdout: 'repo/id1\nrepo/id1/fix\n' };
        }
        return { status: 0 };
      });

      await provider.jettisonMission('id1', 'fix');

      // Should kill the specific session
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'tmux',
        ['kill-session', '-t', 'repo/id1/fix'],
        expect.any(Object),
      );

      // Should NOT remove the worktree because 'repo/id1' (chat) is still there
      expect(mockPm.runSync).not.toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['worktree', 'remove']),
      );
    });

    it('should remove worktree if last session is jettisoned', async () => {
      const provider = new LocalWorktreeProvider(
        projectCtx,
        mockPm,
        mockExecutors,
        'local',
        '/workspaces',
      );

      // Mock ONLY our session exists
      mockPm.runSync.mockImplementation((bin: string, args: string[]) => {
        if (bin === 'tmux' && args[0] === 'list-sessions') {
          return { status: 0, stdout: 'repo/id1/fix\n' };
        }
        return { status: 0 };
      });

      await provider.jettisonMission('id1', 'fix');

      // Should kill the specific session
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'tmux',
        ['kill-session', '-t', 'repo/id1/fix'],
        expect.any(Object),
      );

      // Should remove the worktree
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining([
          'worktree',
          'remove',
          expect.stringContaining('repo/id1'),
        ]),
      );
    });

    it('should remove everything if no action is provided', async () => {
      const provider = new LocalWorktreeProvider(
        projectCtx,
        mockPm,
        mockExecutors,
        'local',
        '/workspaces',
      );

      await provider.jettisonMission('id1');

      // Should remove the worktree first
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining([
          'worktree',
          'remove',
          expect.stringContaining('repo/id1'),
        ]),
      );

      // Should kill potential sessions
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'tmux',
        ['kill-session', '-t', 'repo/id1/fix'],
        expect.any(Object),
      );
    });
  });

  describe('Robust Provisioning', () => {
    it('should swallow error if worktree already exists', async () => {
      const provider = new LocalWorktreeProvider(
        projectCtx,
        mockPm,
        mockExecutors,
        'local',
        '/workspaces',
      );

      // Mock git worktree add failure
      mockPm.runSync.mockImplementation((bin: string, args: string[]) => {
        if (bin === 'git' && args.includes('add')) {
          return {
            status: 128,
            stderr: 'fatal: destination path already exists',
          };
        }
        return { status: 0 };
      });

      // Mock that the directory DOES exist now (created by another process)
      (fs.existsSync as any).mockReturnValue(true);

      const mCtx = {
        branchName: 'feat-1',
        repoSlug: 'repo',
        idSlug: 'id1',
        workspaceName: 'repo/id1',
      } as any;

      // Should NOT throw
      await expect(
        provider.prepareMissionWorkspace(mCtx),
      ).resolves.not.toThrow();
    });

    it('should throw if git worktree add fails for other reasons', async () => {
      const provider = new LocalWorktreeProvider(
        projectCtx,
        mockPm,
        mockExecutors,
        'local',
        '/workspaces',
      );

      mockPm.runSync.mockImplementation((bin: string, args: string[]) => {
        if (bin === 'git' && args.includes('add')) {
          return { status: 1, stderr: 'fatal: some other error' };
        }
        return { status: 0 };
      });

      // Mock that the directory does NOT exist
      (fs.existsSync as any).mockReturnValue(false);

      const mCtx = {
        branchName: 'feat-1',
        repoSlug: 'repo',
        idSlug: 'id1',
        workspaceName: 'repo/id1',
      } as any;

      await expect(provider.prepareMissionWorkspace(mCtx)).rejects.toThrow(
        'Failed to create workspace',
      );
    });
  });
});

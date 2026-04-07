/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StationSupervisor } from './StationSupervisor.js';
import fs from 'node:fs';
import { GitExecutor } from '../core/executors/GitExecutor.js';

vi.mock('node:fs');
vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path');
  return {
    ...actual,
    resolve: (p: string) => p,
  };
});
vi.mock('../core/ProcessManager.js');

// Mock GitExecutor
vi.mock('../core/executors/GitExecutor.js', () => ({
  GitExecutor: {
    init: vi
      .fn()
      .mockImplementation((cwd) => ({
        bin: 'git',
        args: ['init'],
        options: { cwd },
      })),
    remoteAdd: vi.fn().mockImplementation((cwd, name, url) => ({
      bin: 'git',
      args: ['remote', 'add', name, url],
      options: { cwd },
    })),
    fetch: vi
      .fn()
      .mockImplementation((cwd, remote, branch) => ({
        bin: 'git',
        args: ['fetch', '--depth=1', remote, branch],
        options: { cwd },
      })),
    checkout: vi
      .fn()
      .mockImplementation((cwd, branch) => ({
        bin: 'git',
        args: ['checkout', branch],
        options: { cwd },
      })),
    revParse: vi
      .fn()
      .mockImplementation((cwd, args) => ({
        bin: 'git',
        args: ['rev-parse', ...args],
        options: { cwd },
      })),
    verify: vi
      .fn()
      .mockImplementation((cwd, ref) => ({
        bin: 'git',
        args: ['rev-parse', '--verify', ref],
        options: { cwd },
      })),
    checkoutNew: vi
      .fn()
      .mockImplementation((cwd, branch, base) => ({
        bin: 'git',
        args: base
          ? ['checkout', '-b', branch, base]
          : ['checkout', '-b', branch],
        options: { cwd },
      })),
  },
}));

vi.mock('../core/executors/NodeExecutor.js', () => ({
  NodeExecutor: {
    create: vi.fn().mockReturnValue({ bin: 'node', args: ['entrypoint.js'] }),
  },
}));

vi.mock('../core/executors/TmuxExecutor.js', () => ({
  TmuxExecutor: vi.fn().mockImplementation(() => ({
    wrapMission: vi
      .fn()
      .mockReturnValue({ bin: 'tmux', args: ['new-session'] }),
  })),
}));

vi.mock('../core/ConfigManager.js', () => ({
  getRepoConfig: vi.fn().mockReturnValue({}),
  getPrimaryRepoRoot: vi.fn().mockReturnValue('/tmp/repo'),
  sanitizeName: vi.fn((n: string) =>
    n.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase(),
  ),
}));

describe('StationSupervisor', () => {
  let manager: StationSupervisor;
  let mockPm: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPm = {
      runSync: vi.fn(),
      runAsync: vi.fn(),
      spawn: vi.fn(),
    };
    manager = new StationSupervisor('/mock/dirname', mockPm);
  });

  it('initGit performs git initialization', async () => {
    (fs.existsSync as any).mockImplementation((p: string) => {
      if (p.endsWith('.git')) return false;
      return true;
    });

    mockPm.runSync
      .mockReturnValueOnce({ status: 0 }) // init
      .mockReturnValueOnce({ status: 0 }) // remote add
      .mockReturnValueOnce({ status: 0, stdout: 'HEAD' }) // current branch check
      .mockReturnValueOnce({ status: 0 }) // fetch
      .mockReturnValueOnce({ status: 0 }) // check local
      .mockReturnValueOnce({ status: 0 }); // checkout

    await manager.initGit({
      identifier: 'test-id',
      repoName: 'test-repo',
      branchName: 'feat-test',
      action: 'review',
      workspaceName: 'test-repo/test-id',
      workDir: '/test/dir',
      containerName: 'test-repo-test-id',
      policyPath: '/test/policy',
      sessionName: 'test-repo/test-id',
      upstreamUrl: 'https://github.com/org/repo.git',
      mirrorPath: '/mnt/disks/data/main',
    });

    expect(GitExecutor.init).toHaveBeenCalled();
    expect(GitExecutor.remoteAdd).toHaveBeenCalled();
    expect(mockPm.runSync).toHaveBeenCalledTimes(6);
  });

  describe('initGit validation', () => {
    const mockManifest = {
      identifier: 'test-123',
      repoName: 'test-repo',
      branchName: 'feat-test',
      action: 'chat',
      workspaceName: 'test-repo/test-123',
      workDir: '/test/dir',
      upstreamUrl: 'https://github.com/org/repo.git',
      containerName: 'c1',
      sessionName: 's1',
      policyPath: '/p1',
    };

    it('should configure remote origin if missing even if .git exists', async () => {
      // Mock .git exists but no remote configured
      (fs.existsSync as any).mockImplementation((p: string) =>
        p.endsWith('.git'),
      );
      mockPm.runSync.mockImplementation((bin: string, args: string[]) => {
        if (bin === 'git' && args.includes('get-url')) {
          return { status: 1, stdout: '', stderr: 'No remote origin' };
        }
        return { status: 0, stdout: '', stderr: '' };
      });

      await manager.initGit(mockManifest as any);

      // The command should use the original structure (no -C)
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'git',
        ['remote', 'add', 'origin', 'https://github.com/org/repo.git'],
        expect.objectContaining({ cwd: '/test/dir' }),
      );
    });

    it('should fail gracefully if upstreamUrl is missing', async () => {
      const brokenManifest = { ...mockManifest, upstreamUrl: undefined };
      (fs.existsSync as any).mockImplementation((p: string) => {
        if (p.includes('.git')) return false; // Force initialization logic
        return true;
      });
      mockPm.runSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });

      await expect(manager.initGit(brokenManifest as any)).rejects.toThrow(
        'upstreamUrl is required',
      );
    });

    it('should setup git alternates if mirrorPath exists', async () => {
      const manifestWithMirror = { ...mockManifest, mirrorPath: '/mirror' };
      (fs.existsSync as any).mockImplementation((p: string) => {
        if (p.includes('.git')) return false; // Initial init
        if (p === '/mirror/config') return true;
        return false;
      });
      mockPm.runSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });

      await manager.initGit(manifestWithMirror as any);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('alternates'),
        expect.stringContaining('/mirror/objects'),
      );
    });
  });

  it('initGit throws a helpful error on failure', async () => {
    (fs.existsSync as any).mockReturnValue(false);

    mockPm.runSync.mockReturnValueOnce({
      status: 128,
      stdout: '',
      stderr: 'Permission denied',
    });

    await expect(
      manager.initGit({
        identifier: 'test-id',
        repoName: 'test-repo',
        branchName: 'feat-test',
        action: 'review',
        workspaceName: 'test-repo/test-id',
        workDir: '/test/dir',
        upstreamUrl: 'https://github.com/org/repo.git',
      } as any),
    ).rejects.toThrow(/Git command failed: git init/);
  });

  it('setupHooks configures the workspace', async () => {
    (fs.existsSync as any).mockReturnValue(false);

    await manager.setupHooks({
      identifier: 'test-id',
      repoName: 'test-repo',
      branchName: 'feat-test',
      action: 'review',
      workspaceName: 'test-repo/test-id',
      workDir: '/test/dir',
      containerName: 'test-repo-test-id',
      policyPath: '/test/policy',
      sessionName: 'test-repo/test-id',
      upstreamUrl: 'https://github.com/org/repo.git',
    });

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.gemini/orbit'),
      expect.any(Object),
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('state.json'),
      expect.stringContaining('INITIALIZING'),
    );
  });

  it('start orchestrates init, hooks and mission launch', async () => {
    const manifest = {
      identifier: 'test-id',
      repoName: 'test-repo',
      branchName: 'feat-test',
      action: 'chat',
      workspaceName: 'test-repo/test-id',
      workDir: '/test/dir',
      containerName: 'test-repo-test-id',
      policyPath: '/test/policy',
      sessionName: 'test-repo/test-id',
      upstreamUrl: 'https://github.com/org/repo.git',
    };

    const initSpy = vi.spyOn(manager, 'initGit').mockResolvedValue(0 as any);
    const hooksSpy = vi
      .spyOn(manager, 'setupHooks')
      .mockResolvedValue(0 as any);
    const runSpy = vi.spyOn(manager, 'runMission').mockResolvedValue(0 as any);

    await manager.start(manifest);

    expect(initSpy).toHaveBeenCalledWith(manifest);
    expect(hooksSpy).toHaveBeenCalledWith(manifest);
    expect(runSpy).toHaveBeenCalledWith(manifest);
  });

  it('runMission injects GCLI_ORBIT_VERBOSE if manifest.verbose is true', async () => {
    const manifest = {
      identifier: 'test-id',
      repoName: 'test-repo',
      branchName: 'feat-test',
      action: 'chat',
      workspaceName: 'test-repo/test-id',
      workDir: '/test/dir',
      containerName: 'test-repo-test-id',
      policyPath: '/test/policy',
      sessionName: 'test-repo/test-id',
      upstreamUrl: 'https://github.com/org/repo.git',
      verbose: true,
    };

    const mockTmux = {
      wrapMission: vi
        .fn()
        .mockReturnValue({ bin: 'tmux', args: ['new-session'], options: {} }),
    };
    (manager as any).tmux = mockTmux;
    mockPm.runSync.mockReturnValue({ status: 0 });

    await manager.runMission(manifest);

    expect(mockTmux.wrapMission).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        env: expect.objectContaining({
          GCLI_ORBIT_VERBOSE: '1',
        }),
      }),
    );
  });
});

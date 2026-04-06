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
    init: vi.fn().mockReturnValue({ bin: 'git', args: ['init'] }),
    remoteAdd: vi.fn().mockReturnValue({
      bin: 'git',
      args: ['remote', 'add', 'origin', 'https://github.com/org/repo.git'],
    }),
    fetch: vi.fn().mockReturnValue({ bin: 'git', args: ['fetch'] }),
    checkout: vi.fn().mockReturnValue({ bin: 'git', args: ['checkout'] }),
    revParse: vi.fn().mockReturnValue({ bin: 'git', args: ['rev-parse'] }),
    verify: vi
      .fn()
      .mockReturnValue({ bin: 'git', args: ['rev-parse', '--verify'] }),
    checkoutNew: vi
      .fn()
      .mockReturnValue({ bin: 'git', args: ['checkout', '-b'] }),
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
      workDir: '/test/dir',
      containerName: 'orbit-test-repo-test-id',
      policyPath: '/test/policy',
      sessionName: 'orbit/test/id',
      upstreamUrl: 'https://github.com/org/repo.git',
      mirrorPath: '/mnt/disks/data/main',
    });

    expect(GitExecutor.init).toHaveBeenCalled();
    expect(GitExecutor.remoteAdd).toHaveBeenCalled();
    expect(mockPm.runSync).toHaveBeenCalledTimes(6);
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
      workDir: '/test/dir',
      containerName: 'orbit-test-repo-test-id',
      policyPath: '/test/policy',
      sessionName: 'orbit/test/id',
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
      workDir: '/test/dir',
      containerName: 'orbit-test-repo-test-id',
      policyPath: '/test/policy',
      sessionName: 'orbit/test/id',
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
      workDir: '/test/dir',
      containerName: 'orbit-test-repo-test-id',
      policyPath: '/test/policy',
      sessionName: 'orbit/test/id',
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

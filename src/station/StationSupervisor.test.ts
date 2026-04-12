/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StationSupervisor } from './StationSupervisor.js';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('node:fs');
// Don't mock path.resolve globally, just mock what we need
vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path');
  return {
    ...actual,
    default: {
      ...actual,
      resolve: vi.fn((...args: string[]) => (actual as any).resolve(...args)),
    },
    resolve: vi.fn((...args: string[]) => (actual as any).resolve(...args)),
  };
});

describe('StationSupervisor', () => {
  const mockPm: any = {
    runSync: vi.fn(),
    runAsync: vi.fn(),
  };
  const mockTmux: any = {
    wrapMission: vi.fn().mockReturnValue({
      bin: 'tmux',
      args: ['new-session'],
      options: {},
    }),
  };

  let supervisor: StationSupervisor;
  const config = { bundlePath: '/orbit/bundle' };

  beforeEach(() => {
    vi.clearAllMocks();
    supervisor = new StationSupervisor(config as any, mockPm, mockTmux);
    (fs.existsSync as any).mockReturnValue(false);
    (path.resolve as any).mockImplementation((p: string) => p);
  });

  describe('initGit', () => {
    const manifest: any = {
      workDir: '/ws',
      upstreamUrl: 'https://github.com/org/repo.git',
      branchName: 'feature-1',
    };

    it('should initialize a new Git workspace if not exists', async () => {
      // 1. is-inside-work-tree check -> fail (not a repo)
      mockPm.runSync.mockReturnValueOnce({ status: 1 });
      // Subsequent calls succeed
      mockPm.runSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });

      await supervisor.initGit(manifest);

      expect(mockPm.runSync).toHaveBeenCalledWith(
        'git',
        ['rev-parse', '--is-inside-work-tree'],
        expect.anything(),
      );
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'git',
        ['init'],
        expect.anything(),
      );
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'git',
        ['remote', 'add', 'origin', manifest.upstreamUrl],
        expect.anything(),
      );
    });

    it('should handle existing Git workspace and setup origin if missing', async () => {
      // 1. is-inside-work-tree check -> success (is a repo)
      mockPm.runSync.mockReturnValueOnce({ status: 0 });
      // 2. remote get-url origin check -> fail (no remote)
      mockPm.runSync.mockReturnValueOnce({ status: 1 });
      // Subsequent calls succeed
      mockPm.runSync.mockReturnValue({
        status: 0,
        stdout: 'feature-1',
        stderr: '',
      });

      await supervisor.initGit(manifest);

      expect(mockPm.runSync).toHaveBeenCalledWith(
        'git',
        ['rev-parse', '--is-inside-work-tree'],
        expect.anything(),
      );
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'git',
        ['-C', '/ws', 'remote', 'get-url', 'origin'],
        expect.anything(),
      );
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'git',
        ['remote', 'add', 'origin', manifest.upstreamUrl],
        expect.anything(),
      );
    });

    it('should checkout from origin/branch if it exists', async () => {
      mockPm.runSync.mockImplementation((bin: string, args: string[]) => {
        const cmd = args.join(' ');
        if (cmd.includes('is-inside-work-tree')) {
          return { status: 0 };
        }
        if (cmd.includes('remote get-url origin')) {
          return { status: 0, stdout: manifest.upstreamUrl };
        }
        if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
          return { status: 0, stdout: 'main', stderr: '' };
        }
        if (cmd.includes('fetch')) {
          return { status: 0, stdout: '', stderr: '' };
        }
        if (cmd.includes('rev-parse --verify feature-1')) {
          // rev-parse --verify fails for local branch
          return { status: 1, stdout: '', stderr: 'not found' };
        }
        if (cmd.includes('rev-parse --verify origin/feature-1')) {
          // rev-parse --verify succeeds for remote ref
          return { status: 0, stdout: 'hash', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      });

      await supervisor.initGit(manifest);

      expect(mockPm.runSync).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'feature-1', 'origin/feature-1'],
        expect.anything(),
      );
    });

    it('should throw error if Git command fails in run wrapper', async () => {
      // 1. is-inside-work-tree check -> fail (needs init)
      mockPm.runSync.mockReturnValueOnce({ status: 1 });
      // 2. git init -> success
      mockPm.runSync.mockReturnValueOnce({ status: 0 });
      // 3. git remote add -> fail (The first run() that should throw)
      mockPm.runSync.mockReturnValueOnce({
        status: 1,
        stdout: '',
        stderr: 'fatal: error',
      });

      await expect(supervisor.initGit(manifest)).rejects.toThrow(
        /Git command failed/,
      );
    });
  });
});

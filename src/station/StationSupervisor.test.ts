/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StationSupervisor } from './StationSupervisor.js';
import fs from 'node:fs';
import * as ConfigManager from '../core/ConfigManager.js';
import { ProcessManager } from '../core/ProcessManager.js';

vi.mock('node:fs');
vi.mock('../playbooks/fix.js');
vi.mock('../playbooks/ready.js');
vi.mock('../playbooks/review.js');
vi.mock('../core/ConfigManager.js');
vi.mock('../core/ProcessManager.js');

describe('StationSupervisor', () => {
  let manager: StationSupervisor;

  beforeEach(() => {
    vi.resetAllMocks();
    manager = new StationSupervisor('/mock/dirname');
    (ProcessManager.runSync as any).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
    });
    (fs.existsSync as any).mockReturnValue(true);
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      repoName: 'test-repo',
    });
  });

  it('initGit performs git initialization', async () => {
    (fs.existsSync as any).mockImplementation((p: string) => {
      if (p.endsWith('.git')) return false;
      return true;
    });

    (ProcessManager.runSync as any)
      .mockReturnValueOnce({ status: 0 }) // init
      .mockReturnValueOnce({ status: 0 }) // remote add
      .mockReturnValueOnce({ status: 0, stdout: 'HEAD' }) // current branch check
      .mockReturnValueOnce({ status: 0 }) // fetch
      .mockReturnValueOnce({ status: 0 }) // check local
      .mockReturnValueOnce({ status: 0 }); // checkout

    await manager.initGit(
      '/test/dir',
      'https://github.com/org/repo.git',
      'feat-test',
      '/mnt/disks/data/main',
    );

    expect(ProcessManager.runSync).toHaveBeenCalledWith(
      'git',
      ['init'],
      expect.any(Object),
    );
    expect(ProcessManager.runSync).toHaveBeenCalledWith(
      'git',
      ['remote', 'add', 'origin', 'https://github.com/org/repo.git'],
      expect.any(Object),
    );
  });

  it('initGit falls back to new branch creation if origin branch missing', async () => {
    (fs.existsSync as any).mockImplementation((p: string) => {
      if (p.endsWith('.git')) return false;
      return true;
    });

    // Mock sequence:
    // 1. init (0)
    // 2. remote add (0)
    // 3. current branch check (0, 'HEAD')
    // 4. fetch (1) - fail
    // 5. check local (1) - missing
    // 6. check remote (1) - missing
    // 7. checkout -b (0) - fallback
    (ProcessManager.runSync as any)
      .mockReturnValueOnce({ status: 0 }) // init
      .mockReturnValueOnce({ status: 0 }) // remote add
      .mockReturnValueOnce({ status: 0, stdout: 'HEAD' }) // current branch check
      .mockReturnValueOnce({ status: 1 }) // fetch
      .mockReturnValueOnce({ status: 1 }) // check local
      .mockReturnValueOnce({ status: 1 }) // check remote
      .mockReturnValueOnce({ status: 0 }); // checkout -b

    await manager.initGit(
      '/test/dir',
      'https://github.com/org/repo.git',
      'new-branch',
    );

    expect(ProcessManager.runSync).toHaveBeenCalledWith(
      'git',
      ['checkout', '-b', 'new-branch'],
      expect.any(Object),
    );
  });

  it('setupHooks configures the workspace', async () => {
    (fs.existsSync as any).mockReturnValue(false);

    await manager.setupHooks('/test/dir');

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.gemini/orbit'),
      expect.any(Object),
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('state.json'),
      expect.stringContaining('IDLE'),
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('settings.json'),
      expect.stringContaining('BeforeAgent'),
    );
  });
});

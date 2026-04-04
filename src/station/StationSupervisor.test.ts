/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StationSupervisor } from './StationSupervisor.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import * as ConfigManager from '../core/ConfigManager.js';

vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('../playbooks/fix.js');
vi.mock('../playbooks/ready.js');
vi.mock('../playbooks/review.js');
vi.mock('../core/ConfigManager.js');

describe('StationSupervisor', () => {
  let manager: StationSupervisor;

  beforeEach(() => {
    vi.resetAllMocks();
    manager = new StationSupervisor('/mock/dirname');
    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
    } as any);
    (fs.existsSync as any).mockReturnValue(true);
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      repoName: 'test-repo',
    });
  });

  it('initGit performs git initialization', async () => {
    (fs.existsSync as any).mockImplementation((path: string) => {
      if (path.endsWith('.git')) return false;
      return true;
    });

    await manager.initGit(
      '/test/dir',
      'https://github.com/org/repo.git',
      'feat-test',
      '/mnt/disks/data/main',
    );

    expect(spawnSync).toHaveBeenCalledWith('git', ['init'], expect.any(Object));
    expect(spawnSync).toHaveBeenCalledWith(
      'git',
      ['remote', 'add', 'origin', 'https://github.com/org/repo.git'],
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

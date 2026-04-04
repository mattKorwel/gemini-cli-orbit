/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runStation } from './worker.js';

import * as fixPlaybook from '../playbooks/fix.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import * as ConfigManager from '../core/ConfigManager.js';

vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('../playbooks/fix.js');
vi.mock('../playbooks/ready.js');
vi.mock('../playbooks/review.js');
vi.mock('../core/ConfigManager.js');

describe('runStation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: Buffer.from('{"name": "test-repo"}'),
      stderr: Buffer.from(''),
    } as any);
    (fs.existsSync as any).mockReturnValue(true);
    (fs.mkdirSync as any).mockReturnValue(undefined as any);
    (fs.writeFileSync as any).mockReturnValue(undefined as any);
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      repoName: 'test-repo',
    });
  });

  it('should prepare workspace if upstream URL provided', async () => {
    // Simulate non-existent .git
    (fs.existsSync as any).mockImplementation((path: string) => {
      if (path.endsWith('.git')) return false;
      return true;
    });

    await runStation([
      '123',
      'feat-test',
      '/tmp/policy.toml',
      'review',
      'https://github.com/org/repo.git',
      '/mnt/disks/data/main',
    ]);

    // Verify git init and setup
    expect(spawnSync).toHaveBeenCalledWith('git', ['init'], expect.any(Object));
    expect(spawnSync).toHaveBeenCalledWith(
      'git',
      ['remote', 'add', 'origin', 'https://github.com/org/repo.git'],
      expect.any(Object),
    );
    expect(spawnSync).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['fetch', '--reference', '/mnt/disks/data/main']),
      expect.any(Object),
    );
  });

  it('should skip setup if .git already exists', async () => {
    // Simulate existing .git
    (fs.existsSync as any).mockReturnValue(true);

    await runStation([
      '123',
      'feat-test',
      '/tmp/policy.toml',
      'review',
      'https://github.com/org/repo.git',
    ]);

    // Should NOT call git init
    expect(spawnSync).not.toHaveBeenCalledWith(
      'git',
      ['init'],
      expect.any(Object),
    );
    // Should still try to checkout
    expect(spawnSync).toHaveBeenCalledWith(
      'git',
      ['checkout', 'feat-test'],
      expect.any(Object),
    );
  });

  it('should dispatch to the correct playbook', async () => {
    vi.spyOn(fixPlaybook, 'runFixPlaybook').mockResolvedValue(0);

    const res = await runStation([
      '23176',
      'feat-test',
      '/policies/orbit-policy.toml',
      'fix',
    ]);
    expect(res).toBe(0);
    expect(fixPlaybook.runFixPlaybook).toHaveBeenCalled();
  });
});

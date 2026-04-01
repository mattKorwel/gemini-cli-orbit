/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runStation } from './station.js';

import * as fixPlaybook from '../playbooks/fix.js';
import * as readyPlaybook from '../playbooks/ready.js';
import * as reviewPlaybook from '../playbooks/review.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import * as ConfigManager from './ConfigManager.js';

vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('../playbooks/fix.js');
vi.mock('../playbooks/ready.js');
vi.mock('../playbooks/review.js');
vi.mock('./ConfigManager.js');

describe('runStation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: Buffer.from('{"name": "test-repo"}'),
    } as any);
    (fs.existsSync as any).mockReturnValue(true);
    (fs.mkdirSync as any).mockReturnValue(undefined as any);
    (fs.writeFileSync as any).mockReturnValue(undefined as any);
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      repoName: 'test-repo',
    });
  });

  it('should dispatch to the correct playbook', async () => {
    vi.spyOn(fixPlaybook, 'runFixPlaybook').mockResolvedValue(0);

    // Usage: tsx station.ts <ID> <BRANCH_NAME> <POLICY_PATH> [action]
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

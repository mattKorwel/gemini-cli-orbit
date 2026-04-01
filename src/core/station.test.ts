/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runStation } from './station.js';

import { runFixPlaybook } from '../playbooks/fix.js';
import { spawnSync } from 'child_process';
import fs from 'fs';
import * as ConfigManager from './ConfigManager.js';

vi.mock('child_process');
vi.mock('fs');
vi.mock('./playbooks/fix.ts');
vi.mock('./ConfigManager.ts');

describe('runStation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ( spawnSync as any).mockReturnValue({
      status: 0,
      stdout: Buffer.from('{"name": "test-repo"}'),
    } as any);
    ( fs.existsSync as any).mockReturnValue(true);
    ( fs.mkdirSync as any).mockReturnValue(undefined as any);
    ( fs.writeFileSync as any).mockReturnValue(undefined as any);
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      repoName: 'test-repo',
    });
  });

  it('should dispatch to the correct playbook', async () => {
    (runFixPlaybook as any).mockResolvedValue(0);

    // Usage: tsx station.ts <ID> <BRANCH_NAME> <POLICY_PATH> [action]
    const res = await runStation([
      '23176',
      'my-branch',
      '/tmp/policy.toml',
      'fix',
    ]);

    expect(res).toBe(0);
    expect(runFixPlaybook).toHaveBeenCalled();
  });
});

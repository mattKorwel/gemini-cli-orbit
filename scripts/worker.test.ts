/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runWorker } from './worker.ts';
import { spawnSync } from 'child_process';
import { runFixPlaybook } from './playbooks/fix.ts';

vi.mock('child_process');
vi.mock('./playbooks/fix.ts');

describe('runWorker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should dispatch to the correct playbook', async () => {
    vi.mocked(runFixPlaybook).mockResolvedValue(0);
    
    // Usage: tsx worker.ts <ID> <BRANCH_NAME> <POLICY_PATH> [action]
    const res = await runWorker(['23176', 'my-branch', '/tmp/policy.toml', 'fix']);
    
    expect(res).toBe(0);
    expect(runFixPlaybook).toHaveBeenCalled();
  });
});

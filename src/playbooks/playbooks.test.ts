/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

const { mockRegister, mockRun, mockRunAll, mockRunParallel } = vi.hoisted(
  () => ({
    mockRegister: vi.fn(),
    mockRun: vi.fn().mockResolvedValue(0),
    mockRunAll: vi.fn().mockResolvedValue(0),
    mockRunParallel: vi.fn().mockResolvedValue(0),
  }),
);

vi.mock('../core/TaskRunner.js', () => ({
  createTaskRunner: vi.fn().mockReturnValue({
    register: mockRegister,
    run: mockRun,
    runAll: mockRunAll,
    runParallel: mockRunParallel,
  }),
}));

vi.mock('node:fs');

describe('Playbooks', () => {
  const pr = '23176';
  const dir = '/tmp/mission';
  const policy = '/tmp/policy.toml';
  const bin = '/bin/gemini';
  const logDir = '/tmp/log-dir';
  const header = '🚀 Test Mission';

  beforeEach(() => {
    vi.clearAllMocks();
    (fs.readFileSync as any).mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('guidelines.md')) return 'GUIDE';
      if (typeof p === 'string' && p.includes('implementation-plan.md'))
        return 'PLAN';
      if (typeof p === 'string' && p.includes('plan-review-v1.md')) return 'GO';
      return '';
    });
    (fs.existsSync as any).mockReturnValue(true);
  });

  it('should run fix playbook', async () => {
    const { runFixPlaybook } = await import('./fix.js');
    const res = await runFixPlaybook(pr, dir, policy, bin, logDir, header);
    expect(res).toBe(0);
    expect(mockRegister).toHaveBeenCalled();
    expect(mockRunParallel).toHaveBeenCalled();
    expect(mockRunAll).toHaveBeenCalled();
  });

  it('should run implement playbook', async () => {
    const { runImplementPlaybook } = await import('./implement.js');
    const res = await runImplementPlaybook(
      pr,
      dir,
      policy,
      bin,
      logDir,
      header,
    );
    expect(res).toBe(0);
    expect(mockRegister).toHaveBeenCalled();
    expect(mockRunParallel).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalled();
  });
});

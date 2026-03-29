/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

vi.mock('node:child_process');
vi.mock('node:fs');

const mockRun = vi.fn().mockResolvedValue(0);
const mockRegister = vi.fn();
const mockRunAll = vi.fn().mockResolvedValue(0);
const mockRunParallel = vi.fn().mockResolvedValue(0);

vi.mock('../TaskRunner.ts', () => ({
  createTaskRunner: vi.fn().mockImplementation(() => ({
    run: mockRun,
    register: mockRegister,
    runAll: mockRunAll,
    runParallel: mockRunParallel,
  })),
}));

describe('Playbooks', () => {
  const pr = '23176';
  const dir = '/work-dir';
  const policy = '/policy';
  const bin = '/bin/gemini';
  const logDir = '/tmp/log-dir';
  const header = '🚀 Test Mission';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRun.mockResolvedValue(0);
    mockRunAll.mockResolvedValue(0);
    mockRunParallel.mockResolvedValue(0);
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      if (typeof p === 'string' && p.includes('plan-review-v1.md')) return 'GO';
      return '';
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('should run fix playbook', async () => {
    const { runFixPlaybook } = await import('./fix.js');
    const res = await runFixPlaybook(pr, dir, policy, bin, logDir, header);
    expect(res).toBe(0);
    expect(mockRegister).toHaveBeenCalledTimes(3);
    expect(mockRunParallel).toHaveBeenCalledTimes(2);
    expect(mockRunAll).toHaveBeenCalledTimes(1);
  });

  it('should run ready playbook', async () => {
    const { runReadyPlaybook } = await import('./ready.js');
    const res = await runReadyPlaybook(pr, dir, policy, bin, logDir, header);
    expect(res).toBe(0);
    expect(mockRegister).toHaveBeenCalled();
    expect(mockRunAll).toHaveBeenCalled();
  });

  it('should run review playbook', async () => {
    const { runReviewPlaybook } = await import('./review.js');
    const res = await runReviewPlaybook(
      pr,
      dir,
      policy,
      bin,
      logDir,
      header,
      '/tmp/guidelines.md',
    );
    expect(res).toBe(0);
    expect(mockRegister).toHaveBeenCalled();
    expect(mockRunParallel).toHaveBeenCalled();
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
      '/tmp/guidelines.md',
    );
    expect(res).toBe(0);
    expect(mockRegister).toHaveBeenCalledTimes(2);
    expect(mockRunParallel).toHaveBeenCalledTimes(2);
    expect(mockRun).toHaveBeenCalled();
  });
});

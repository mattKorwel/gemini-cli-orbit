/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';

vi.mock('node:child_process');

const mockRun = vi.fn().mockResolvedValue(0);
const mockRegister = vi.fn();
const mockRunAll = vi.fn().mockResolvedValue(0);

vi.mock('../TaskRunner.ts', () => ({
  createTaskRunner: vi.fn().mockImplementation(() => ({
    run: mockRun,
    register: mockRegister,
    runAll: mockRunAll,
  })),
}));

describe('Playbooks', () => {
  const pr = '23176';
  const dir = '/work-dir';
  const policy = '/policy';
  const bin = '/bin/gemini';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRun.mockResolvedValue(0);
    mockRunAll.mockResolvedValue(0);
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
  });

  it('should run fix playbook', async () => {
    const { runFixPlaybook } = await import('./fix.ts');
    const res = await runFixPlaybook(dir, pr, policy, bin);
    expect(res).toBe(0);
    expect(spawnSync).toHaveBeenCalled();
  });

  it('should run ready playbook', async () => {
    const { runReadyPlaybook } = await import('./ready.ts');
    const res = await runReadyPlaybook(pr, dir, policy, bin);
    expect(res).toBe(0);
    expect(mockRegister).toHaveBeenCalled();
    expect(mockRunAll).toHaveBeenCalled();
  });

  it('should run review playbook', async () => {
    const { runReviewPlaybook } = await import('./review.ts');
    const res = await runReviewPlaybook(pr, dir, policy, bin);
    expect(res).toBe(0);
    expect(mockRegister).toHaveBeenCalled();
    expect(mockRunAll).toHaveBeenCalled();
  });
});

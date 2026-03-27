/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTaskRunner } from './TaskRunner.js';
import { spawnSync } from 'node:child_process';

vi.mock('node:child_process');
vi.mock('node:fs');

describe('createTaskRunner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should run a single command', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    const runner = createTaskRunner('/tmp', 'test');
    const code = await runner.run('echo hello');
    expect(code).toBe(0);
    expect(spawnSync).toHaveBeenCalled();
  });

  it('should register and run all tasks', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    const runner = createTaskRunner('/tmp', 'test');
    runner.register([{ id: '1', name: 'task1', cmd: 'echo 1' }]);
    const code = await runner.runAll();
    expect(code).toBe(0);
    expect(spawnSync).toHaveBeenCalled();
  });

  it('should return error if a task fails', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1 } as any);
    const runner = createTaskRunner('/tmp', 'test');
    runner.register([{ id: '1', name: 'fail', cmd: 'false' }]);
    const code = await runner.runAll();
    expect(code).toBe(1);
  });
});

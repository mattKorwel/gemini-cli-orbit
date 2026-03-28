/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTaskRunner } from './TaskRunner.js';
import { spawnSync, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process');
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs') as any;
  return {
    ...actual,
    createWriteStream: vi.fn().mockReturnValue({
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
    }),
    mkdirSync: vi.fn(),
  };
});

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

  it('should register and run all tasks (sequential)', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    const runner = createTaskRunner('/tmp', 'test');
    runner.register([{ id: '1', name: 'task1', cmd: 'echo 1' }]);
    const code = await runner.runAll();
    expect(code).toBe(0);
    expect(spawnSync).toHaveBeenCalled();
  });

  it('should return error if a task fails (sequential)', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1 } as any);
    const runner = createTaskRunner('/tmp', 'test');
    runner.register([{ id: '1', name: 'fail', cmd: 'false' }]);
    const code = await runner.runAll();
    expect(code).toBe(1);
  });

  it('should run tasks in parallel', async () => {
    const mockProc = new EventEmitter() as any;
    mockProc.stdout = new EventEmitter();
    (mockProc.stdout as any).pipe = vi.fn();
    mockProc.stderr = new EventEmitter();
    (mockProc.stderr as any).pipe = vi.fn();
    
    vi.mocked(spawn).mockReturnValue(mockProc);
    
    const runner = createTaskRunner('/tmp', 'test');
    runner.register([{ id: '1', name: 'task1', cmd: 'echo 1' }]);
    
    const parallelPromise = runner.runParallel();
    
    // Simulate process completion
    setTimeout(() => {
      mockProc.emit('close', 0);
    }, 100);

    const code = await parallelPromise;
    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalled();
  });
});

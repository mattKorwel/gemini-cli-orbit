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
  const actual = (await vi.importActual('node:fs')) as any;
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

  it('should persist completion state across multiple runs', async () => {
    const mockProc1 = new EventEmitter() as any;
    mockProc1.stdout = new EventEmitter();
    (mockProc1.stdout as any).pipe = vi.fn();
    mockProc1.stderr = new EventEmitter();
    (mockProc1.stderr as any).pipe = vi.fn();

    const mockProc2 = new EventEmitter() as any;
    mockProc2.stdout = new EventEmitter();
    (mockProc2.stdout as any).pipe = vi.fn();
    mockProc2.stderr = new EventEmitter();
    (mockProc2.stderr as any).pipe = vi.fn();

    vi.mocked(spawn)
      .mockReturnValueOnce(mockProc1)
      .mockReturnValueOnce(mockProc2);

    const runner = createTaskRunner('/tmp', 'persistence-test');

    // Run Task A
    runner.register([{ id: 'A', name: 'Task A', cmd: 'echo A' }]);
    const p1 = runner.runParallel();
    setTimeout(() => mockProc1.emit('close', 0), 50);
    await p1;

    // Run Task B which depends on A
    runner.register([{ id: 'B', name: 'Task B', cmd: 'echo B', dep: 'A' }]);
    const p2 = runner.runParallel();
    setTimeout(() => mockProc2.emit('close', 0), 50);
    const code = await p2;

    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('should handle task timeouts', async () => {
    vi.useFakeTimers();
    const mockProc = new EventEmitter() as any;
    mockProc.stdout = new EventEmitter();
    (mockProc.stdout as any).pipe = vi.fn();
    mockProc.stderr = new EventEmitter();
    (mockProc.stderr as any).pipe = vi.fn();
    mockProc.kill = vi.fn();

    vi.mocked(spawn).mockReturnValue(mockProc);

    const runner = createTaskRunner('/tmp', 'timeout-test');
    runner.register([
      { id: 'T', name: 'Slow Task', cmd: 'sleep 100', timeout: 1000 },
    ]);

    const parallelPromise = runner.runParallel();

    // Advance time past timeout
    await vi.advanceTimersByTimeAsync(1500);

    const code = await parallelPromise;
    expect(code).toBe(1); // Fails due to timeout
    expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL');
    vi.useRealTimers();
  });
});

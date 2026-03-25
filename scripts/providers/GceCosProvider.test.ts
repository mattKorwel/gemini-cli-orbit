/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GceCosProvider } from './GceCosProvider.ts';
import { GceConnectionManager } from './GceConnectionManager.ts';
import { spawnSync } from 'child_process';
import fs from 'fs';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

describe('GceCosProvider', () => {
  const projectId = 'test-project';
  const zone = 'us-west1-a';
  const instanceName = 'test-instance';
  const repoRoot = '/repo/root';
  let provider: GceCosProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    provider = new GceCosProvider(projectId, zone, instanceName, repoRoot);
  });

  it('should check instance status via gcloud', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: Buffer.from(JSON.stringify({ name: instanceName, status: 'RUNNING' })),
    } as any);

    const status = await provider.getStatus();
    
    expect(spawnSync).toHaveBeenCalledWith('gcloud', expect.arrayContaining(['describe', instanceName]), expect.any(Object));
    expect(status.status).toBe('RUNNING');
  });

  it('should trigger instance start in ensureReady if not running', async () => {
    // getStatus returns TERMINATED
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stdout: Buffer.from(JSON.stringify({ name: instanceName, status: 'TERMINATED' })),
    } as any);
    
    // start command succeeds
    vi.mocked(spawnSync).mockReturnValueOnce({ status: 0 } as any);
    
    // Mock the connection manager methods on the prototype
    const runSpy = vi.spyOn(GceConnectionManager.prototype, 'run').mockReturnValue({ status: 0, stdout: 'abc', stderr: '' });

    // We need to bypass the setTimeout
    vi.useFakeTimers();
    const readyPromise = provider.ensureReady();
    await vi.runAllTimersAsync();
    const res = await readyPromise;

    expect(res).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith('gcloud', expect.arrayContaining(['start', instanceName]), expect.any(Object));
    runSpy.mockRestore();
  });

  it('should use connection manager for exec and sync', async () => {
    const runSpy = vi.spyOn(GceConnectionManager.prototype, 'run').mockReturnValue({ status: 0, stdout: 'ok', stderr: '' });
    const syncSpy = vi.spyOn(GceConnectionManager.prototype, 'sync').mockReturnValue(0);
    
    await provider.exec('ls');
    expect(runSpy).toHaveBeenCalledWith(expect.stringContaining('ls'), expect.any(Object));

    await provider.sync('/src', '/dest');
    expect(syncSpy).toHaveBeenCalledWith('/src', '/dest', expect.any(Object));
    
    runSpy.mockRestore();
    syncSpy.mockRestore();
  });
});

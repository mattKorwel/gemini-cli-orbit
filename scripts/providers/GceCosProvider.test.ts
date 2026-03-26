/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GceCosProvider } from './GceCosProvider.ts';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

vi.mock('node:child_process');
vi.mock('node:fs');

const mockConn = {
  run: vi.fn(),
  sync: vi.fn().mockResolvedValue(0),
  getMagicRemote: vi.fn().mockReturnValue('user@host'),
  getRunCommand: vi.fn().mockReturnValue('ssh-cmd'),
};

vi.mock('./GceConnectionManager.ts', () => ({
  GceConnectionManager: function() {
    return mockConn;
  },
}));

describe('GceCosProvider', () => {
  const projectId = 'test-p';
  const zone = 'us-west1-a';
  const instanceName = 'test-i';
  const repoRoot = '/repo';
  let provider: GceCosProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    
    mockConn.run.mockResolvedValue({ status: 0, stdout: '', stderr: '' });
    mockConn.sync.mockResolvedValue(0);

    provider = new GceCosProvider(projectId, zone, instanceName, repoRoot);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should get status from gcloud', async () => {
    // Exact table data matching the split logic: lines[1].trim().split(/[ ]+/)
    // parts[2]=status, parts[3]=internal, parts[4]=external
    const tableData = 'NAME ZONE STATUS INTERNAL_IP EXTERNAL_IP\ntest-i us-west1-a RUNNING 10.0.0.1 34.0.0.1';
    vi.mocked(spawnSync).mockReturnValue({ 
        status: 0, 
        stdout: Buffer.from(tableData) 
    } as any);
    
    const status = await provider.getStatus();
    expect(status.status).toBe('RUNNING');
    expect(status.internalIp).toBe('10.0.0.1');
    expect(status.externalIp).toBe('34.0.0.1');
  });

  it('should execute ensureReady and refresh container if missing', async () => {
    const tableData = 'NAME ZONE STATUS INTERNAL_IP EXTERNAL_IP\ntest-i us-west1-a RUNNING 10.1 34.1';
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: Buffer.from(tableData) } as any);
    
    // 1. ps -a check returns empty
    mockConn.run.mockResolvedValueOnce({ status: 0, stdout: '', stderr: '' }); 
    // 2. getContainerStatus returns true to stop loop
    mockConn.run.mockResolvedValue({ status: 0, stdout: 'true', stderr: '' }); 

    const readyPromise = provider.ensureReady();
    await vi.runAllTimersAsync();
    const res = await readyPromise;

    expect(res).toBe(0);
    expect(mockConn.run).toHaveBeenCalledWith(expect.stringContaining('docker pull'), expect.any(Object));
  });

  it('should setup the remote worker environment', async () => {
    // SSH verification loop succeeded
    mockConn.run.mockResolvedValue({ status: 0, stdout: 'ok', stderr: '' });
    
    const resPromise = provider.setup({
        projectId: 'p',
        zone: 'z',
        dnsSuffix: '.s',
        userSuffix: '_u',
        backendType: 'iap'
    });

    await vi.runAllTimersAsync();
    const res = await resPromise;

    expect(res).toBe(0);
  });
});

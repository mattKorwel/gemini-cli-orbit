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
  onProvisioned: vi.fn().mockResolvedValue(undefined),
  setupNetworkInfrastructure: vi.fn(),
  getNetworkInterfaceConfig: vi.fn().mockReturnValue('network=default,no-address'),
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
    const mockData = {
      name: 'test-i',
      status: 'RUNNING',
      networkInterfaces: [{
        networkIP: '10.0.0.1',
        accessConfigs: [{ natIP: '34.0.0.1' }]
      }]
    };
    vi.mocked(spawnSync).mockReturnValue({ 
        status: 0, 
        stdout: Buffer.from(JSON.stringify(mockData)) 
    } as any);
    
    const status = await provider.getStatus();
    expect(status.status).toBe('RUNNING');
    expect(status.internalIp).toBe('10.0.0.1');
    expect(status.externalIp).toBe('34.0.0.1');
  });

  it('should have public projectId and zone', () => {
    expect(provider.projectId).toBe(projectId);
    expect(provider.zone).toBe(zone);
    expect(provider.workerName).toBe('development-worker');
  });

  it('should list workers for the user', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    const res = await provider.listWorkers();
    expect(res).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith(
        'gcloud',
        expect.arrayContaining(['compute', 'instances', 'list', '--filter', expect.stringContaining('gcli-workspace-')]),
        expect.any(Object)
    );
  });

  it('should destroy the worker and its resources', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    const res = await provider.destroy();
    expect(res).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith(
        'gcloud',
        expect.arrayContaining(['compute', 'instances', 'delete', 'test-i']),
        expect.any(Object)
    );
    expect(spawnSync).toHaveBeenCalledWith(
        'gcloud',
        expect.arrayContaining(['compute', 'addresses', 'delete', 'test-i-ip']),
        expect.any(Object)
    );
  });

  it('should list active workspace containers', async () => {
    // Mock getExecOutput behavior via mockConn.run
    mockConn.run.mockResolvedValue({ 
        status: 0, 
        stdout: 'gcli-pr-123\ngcli-pr-456\n', 
        stderr: '' 
    });
    
    const containers = await provider.listContainers();
    expect(containers).toEqual(['gcli-pr-123', 'gcli-pr-456']);
  });

  it('should execute ensureReady and refresh container if missing', async () => {
    const mockData = {
      name: 'test-i',
      status: 'RUNNING',
      networkInterfaces: [{
        networkIP: '10.1',
        accessConfigs: [{ natIP: '34.1' }]
      }]
    };
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: Buffer.from(JSON.stringify(mockData)) } as any);
    
    // 1. inspect check returns status 1 (container missing)
    mockConn.run.mockResolvedValueOnce({ status: 1, stdout: '', stderr: 'Error: No such object' }); 
    // 2. Refresh commands (pull, rm, run) - we'll just mock them all succeeding
    mockConn.run.mockResolvedValue({ status: 0, stdout: 'true', stderr: '' }); 

    const readyPromise = provider.ensureReady();
    await vi.runAllTimersAsync();
    const res = await readyPromise;

    expect(res).toBe(0);
    expect(mockConn.run).toHaveBeenCalledWith(expect.stringContaining('docker pull'), expect.any(Object));
    expect(mockConn.run).toHaveBeenCalledWith(expect.stringContaining('docker run -d --name development-worker'), expect.any(Object));
  });
});

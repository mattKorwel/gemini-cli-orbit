/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GceCosProvider } from './GceCosProvider.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('../core/Logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    logOutput: vi.fn(),
  },
}));

const mockConn = {
  run: vi.fn(),
  sync: vi.fn().mockResolvedValue(0),
  getMagicRemote: vi.fn().mockReturnValue('user@host'),
  getRunCommand: vi.fn().mockReturnValue('ssh-cmd'),
  onProvisioned: vi.fn().mockResolvedValue(undefined),
  setOverrideHost: vi.fn(),
};

vi.mock('./GceConnectionManager.js', () => ({
  GceConnectionManager: function () {
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
    (fs.existsSync as any).mockReturnValue(true);
    (fs.mkdirSync as any).mockReturnValue(undefined);

    mockConn.run.mockReturnValue({ status: 0, stdout: '', stderr: '' });
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
      networkInterfaces: [
        {
          networkIP: '10.0.0.1',
          accessConfigs: [{ natIP: '34.0.0.1' }],
        },
      ],
    };
    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: Buffer.from(JSON.stringify(mockData)),
    } as any);

    const status = await provider.getStatus();
    expect(status.status).toBe('RUNNING');
    expect(status.internalIp).toBe('10.0.0.1');
    expect(status.externalIp).toBe('34.0.0.1');
  });

  it('should have public projectId and zone', () => {
    expect(provider.projectId).toBe(projectId);
    expect(provider.zone).toBe(zone);
    expect(provider.stationName).toBe('test-i');
  });

  it('should list stations for the user', async () => {
    (spawnSync as any).mockReturnValue({ status: 0 } as any);
    const res = await provider.listStations();
    expect(res).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'list',
        '--project',
        'test-p',
        '--filter',
        'labels.orbit-managed=true',
      ],
      { stdio: 'inherit' },
    );
  });

  it('should destroy the station and its resources', async () => {
    (spawnSync as any).mockReturnValue({ status: 0 } as any);
    const res = await provider.destroy();
    expect(res).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'delete',
        'test-i',
        '--project',
        'test-p',
        '--zone',
        'us-west1-a',
        '--quiet',
      ],
      { stdio: 'inherit' },
    );
  });

  it('should list active orbit capsules', async () => {
    mockConn.run.mockReturnValue({
      status: 0,
      stdout: Buffer.from('gcli-pr-123\ngcli-pr-456\n'),
      stderr: Buffer.from(''),
    });

    const capsules = await provider.listCapsules();
    expect(capsules).toEqual(['gcli-pr-123', 'gcli-pr-456']);
  });

  it('should execute ensureReady and refresh capsule if missing', async () => {
    // 1. inspect check returns status 1 (capsule missing)
    mockConn.run.mockReturnValueOnce({
      status: 0,
      stdout: '0', // ls -d success
    });
    mockConn.run.mockReturnValueOnce({
      status: 1,
      stdout: Buffer.from(''),
      stderr: Buffer.from('Error: No such object'),
    });
    // 2. Refresh commands (pull, rm, run)
    mockConn.run.mockReturnValue({
      status: 0,
      stdout: Buffer.from('true'),
      stderr: Buffer.from(''),
    });

    const readyPromise = provider.ensureReady();
    await vi.runAllTimersAsync();
    const res = await readyPromise;

    expect(res).toBe(0);
    expect(mockConn.run).toHaveBeenCalledWith(
      expect.stringContaining('ls -d /repo/.git'),
      expect.any(Object),
    );
  });

  it('should inject infrastructure state into connection manager', () => {
    provider.injectState({
      status: 'ready',
      privateIp: '10.0.0.5',
      publicIp: '34.0.0.5',
    });
    expect(mockConn.setOverrideHost).toHaveBeenCalledWith('10.0.0.5');
  });

  it('should use sudo for docker status and stats commands', async () => {
    mockConn.run.mockReturnValue({ status: 0, stdout: 'true', stderr: '' });

    await provider.getCapsuleStatus('test-capsule');
    expect(mockConn.run).toHaveBeenCalledWith(
      expect.stringContaining('sudo docker inspect'),
      expect.any(Object),
    );

    await provider.getCapsuleStats('test-capsule');
    expect(mockConn.run).toHaveBeenCalledWith(
      expect.stringContaining('sudo docker stats'),
      expect.any(Object),
    );
  });
});

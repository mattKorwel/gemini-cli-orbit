/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GceCosProvider } from './GceCosProvider.js';
import fs from 'node:fs';
import { type ProjectContext } from '../core/Constants.js';

vi.mock('node:fs');
vi.mock('../core/Logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    logOutput: vi.fn(),
  },
  LogLevel: {
    INFO: 'INFO',
    ERROR: 'ERROR',
    WARN: 'WARN',
  },
}));

const mockSsh = {
  runHostCommand: vi.fn(),
  runDockerExec: vi.fn(),
  syncPath: vi.fn().mockResolvedValue(0),
  getMagicRemote: vi.fn().mockReturnValue('user@host'),
  getBackendType: vi.fn().mockReturnValue('direct-internal'),
  setOverrideHost: vi.fn(),
  attachToTmux: vi.fn().mockResolvedValue(0),
  syncPathIfChanged: vi.fn().mockResolvedValue(0),
};

describe('GceCosProvider', () => {
  const projectId = 'test-p';
  const zone = 'us-west1-a';
  const instanceName = 'test-i';
  const repoRoot = '/repo';
  const projectCtx: ProjectContext = {
    repoRoot,
    repoName: 'repo',
  };
  let provider: GceCosProvider;

  const mockPm: any = {
    runSync: vi.fn(),
    runAsync: vi.fn(),
    spawn: vi.fn(),
  };

  const mockExecutors: any = {
    git: {},
    docker: {},
    tmux: {},
    node: {},
    gemini: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (fs.existsSync as any).mockReturnValue(true);
    (fs.mkdirSync as any).mockReturnValue(undefined);

    mockSsh.runHostCommand.mockResolvedValue({
      status: 0,
      stdout: '',
      stderr: '',
    });
    mockSsh.runDockerExec.mockResolvedValue({
      status: 0,
      stdout: '',
      stderr: '',
    });
    mockSsh.syncPath.mockResolvedValue(0);
    mockPm.runSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });

    provider = new GceCosProvider(
      projectCtx,
      projectId,
      zone,
      instanceName,
      repoRoot,
      mockSsh as any,
      mockPm,
      mockExecutors,
      { projectId, zone, instanceName } as any,
    );
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
    mockPm.runSync.mockReturnValue({
      status: 0,
      stdout: JSON.stringify(mockData),
      stderr: '',
    });

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
    mockPm.runSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });
    const res = await provider.listStations();
    expect(res).toBe(0);
    expect(mockPm.runSync).toHaveBeenCalledWith(
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
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });

  it('should list active orbit capsules', async () => {
    mockSsh.runHostCommand.mockResolvedValue({
      status: 0,
      stdout: 'orbit-pr-123\norbit-pr-456\n',
      stderr: '',
    });

    const capsules = await provider.listCapsules();
    expect(capsules).toEqual(['orbit-pr-123', 'orbit-pr-456']);
  });

  it('should execute ensureReady and refresh capsule if missing', async () => {
    // 1. repo check success
    mockSsh.runHostCommand.mockResolvedValueOnce({
      status: 0,
      stdout: '',
      stderr: '',
    });
    // 2. initial capsule check (missing)
    mockSsh.runHostCommand.mockResolvedValueOnce({
      status: 1,
      stdout: '',
      stderr: 'No such object',
    });
    // 3. refresh commands (pull, rm, run)
    mockSsh.runHostCommand.mockResolvedValue({
      status: 0,
      stdout: '',
      stderr: '',
    });
    // 4. Signal lock checks (running)
    mockSsh.runHostCommand.mockResolvedValue({
      status: 0,
      stdout: 'true',
      stderr: '',
    });

    const readyPromise = provider.ensureReady();
    await vi.runAllTimersAsync();
    const res = await readyPromise;

    expect(res).toBe(0);
    expect(mockSsh.runHostCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        bin: '/bin/bash',
        args: expect.arrayContaining([
          expect.stringContaining('ls -d /repo/.git'),
        ]),
      }),
      expect.any(Object),
    );
  });

  it('should inject infrastructure state into connection manager', () => {
    (provider as any).projectCtx.backendType = 'external';
    provider.injectState({
      status: 'ready',
      privateIp: '10.0.0.5',
      publicIp: '34.0.0.5',
    });
    expect(mockSsh.setOverrideHost).toHaveBeenCalledWith('34.0.0.5');
  });

  it('should use host exec for capsule status commands', async () => {
    mockSsh.runHostCommand.mockResolvedValue({
      status: 0,
      stdout: 'true',
      stderr: '',
    });

    await provider.getCapsuleStatus('test-capsule');
    expect(mockSsh.runHostCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          expect.stringContaining('sudo docker inspect'),
        ]),
      }),
      expect.objectContaining({ quiet: true }),
    );

    await provider.getCapsuleStats('test-capsule');
    expect(mockSsh.runHostCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          expect.stringContaining('sudo docker stats'),
        ]),
      }),
      expect.objectContaining({ quiet: true }),
    );
  });

  it('should not include sensitiveEnv in docker run flags', async () => {
    mockSsh.runHostCommand.mockResolvedValue({
      status: 0,
      stdout: '',
      stderr: '',
    });

    await provider.runCapsule({
      name: 'test-capsule',
      image: 'test-image',
      mounts: [],
      env: { PUBLIC_VAR: 'public' },
      sensitiveEnv: { PRIVATE_VAR: 'secret' },
    });

    const lastCall = mockSsh.runHostCommand.mock.calls.find((call: any) =>
      call[0].args.some((arg: string) => arg.includes('docker run')),
    );

    expect(lastCall).toBeDefined();
    const dockerCmd = lastCall![0].args.find((arg: string) =>
      arg.includes('docker run'),
    );
    expect(dockerCmd).toContain("-e PUBLIC_VAR='\\''public'\\''");
    expect(dockerCmd).not.toContain("-e PRIVATE_VAR='\\''secret'\\''");
  });
});

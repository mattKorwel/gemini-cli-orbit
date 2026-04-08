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
    debug: vi.fn(),
    logOutput: vi.fn(),
  },
  LogLevel: {
    INFO: 'INFO',
    ERROR: 'ERROR',
    WARN: 'WARN',
  },
}));

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

  const mockSsh = {
    runHostCommand: vi.fn(),
    runDockerExec: vi.fn(),
    syncPath: vi.fn().mockResolvedValue(0),
    getMagicRemote: vi.fn().mockReturnValue('user@host'),
    getBackendType: vi.fn().mockReturnValue('direct-internal'),
    setOverrideHost: vi.fn(),
    attachToTmux: vi.fn().mockResolvedValue(0),
    syncPathIfChanged: vi.fn().mockResolvedValue(0),
    resolvePolicyPath: vi.fn().mockReturnValue('/mock/policy.toml'),
    withConnectivityRetry: vi.fn().mockImplementation((op) => op()), // Unified retry mock
  };
  mockSsh.runDockerExec.mockResolvedValue({
    status: 0,
    stdout: 'session',
    stderr: '',
  });

  const mockExecutors: any = {
    git: {},
    docker: {
      run: vi.fn().mockReturnValue({ bin: 'docker', args: ['run'] }),
      stop: vi.fn().mockReturnValue({ bin: 'docker', args: ['stop'] }),
      remove: vi.fn().mockReturnValue({ bin: 'docker', args: ['rm'] }),
    },
    tmux: {},
    node: {
      createRemote: vi.fn().mockReturnValue({ bin: 'node', args: [] }),
    },
    gemini: {},
    ssh: mockSsh,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    (fs.existsSync as any).mockReturnValue(true);

    mockSsh.runHostCommand.mockResolvedValue({
      status: 0,
      stdout: '',
      stderr: '',
    });
    mockSsh.syncPathIfChanged.mockResolvedValue(0);
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
    mockPm.runSync.mockReturnValue({
      status: 0,
      stdout: JSON.stringify({
        name: instanceName,
        status: 'RUNNING',
        networkInterfaces: [{ networkIP: '1.2.3.4' }],
      }),
    });

    const status = await provider.getStatus();
    expect(status.status).toBe('RUNNING');
    expect(status.internalIp).toBe('1.2.3.4');
  });

  it('should list stations for the user', async () => {
    mockPm.runSync.mockReturnValue({
      status: 0,
      stdout: JSON.stringify([{ name: 's1' }, { name: 's2' }]),
    });

    const stations = await provider.listStations();
    expect(stations).toBe(0);
  });

  it('should list active orbit capsules', async () => {
    mockSsh.runHostCommand.mockResolvedValue({
      status: 0,
      stdout: 'c1\nc2\n',
      stderr: '',
    });

    const capsules = await provider.listCapsules();
    expect(capsules).toEqual(['c1', 'c2']);
  });

  it('should propagate TrueColor environment variables to capsules', async () => {
    await provider.getExecOutput('ls', { isolationId: 'my-capsule' });

    expect(mockSsh.runDockerExec).toHaveBeenCalledWith(
      'my-capsule',
      expect.objectContaining({
        env: expect.objectContaining({
          COLORTERM: 'truecolor',
          FORCE_COLOR: '3',
          TERM: 'xterm-256color',
        }),
      }),
      expect.anything(),
    );
  });

  it('should execute ensureReady and refresh capsule if missing', async () => {
    // 1. repo check
    mockSsh.runHostCommand.mockResolvedValueOnce({
      status: 0,
      stdout: '',
      stderr: '',
    });
    // 2. mount check
    mockSsh.runHostCommand.mockResolvedValueOnce({
      status: 0,
      stdout: '/mnt/disks/data',
      stderr: '',
    });
    // 3. mkdir -p check
    mockSsh.runHostCommand.mockResolvedValueOnce({
      status: 0,
      stdout: '',
      stderr: '',
    });
    // 4. initial capsule check (exists)
    mockSsh.runHostCommand.mockResolvedValueOnce({
      status: 0,
      stdout: 'true',
      stderr: '',
    });
    // 5. Signal lock loop check
    mockSsh.runHostCommand.mockResolvedValueOnce({
      status: 0,
      stdout: 'true',
      stderr: '',
    });

    const readyPromise = provider.ensureReady();
    await vi.runAllTimersAsync();
    const res = await readyPromise;

    expect(res).toBe(0);
  });

  it('should use executors for capsule operations', async () => {
    await provider.runCapsule({ image: 'img', name: 'c1' } as any);
    expect(mockExecutors.docker.run).toHaveBeenCalled();

    await provider.stopCapsule('c1');
    expect(mockExecutors.docker.stop).toHaveBeenCalledWith('c1');

    await provider.removeCapsule('c1');
    expect(mockExecutors.docker.remove).toHaveBeenCalledWith('c1');
  });

  it('should fetch mission telemetry via SSH/Docker', async () => {
    mockSsh.runHostCommand.mockImplementation(async (cmdObj: any) => {
      const args = cmdObj.args || [];
      const cmd = args.join(' ');
      if (cmd.includes('docker ps')) {
        return { status: 0, stdout: 'repo-123', stderr: '' };
      }
      if (cmd.includes('station.js status')) {
        return {
          status: 0,
          stdout: JSON.stringify({
            missions: [
              { repo: 'repo', mission: 'repo-123', status: 'THINKING' },
            ],
          }),
          stderr: '',
        };
      }
      if (cmd.includes('docker stats')) {
        return { status: 0, stdout: '10% / 100MB', stderr: '' };
      }
      // Default success for other commands like tmux list-sessions
      return { status: 0, stdout: 'session', stderr: '' };
    });

    const telemetry = await provider.getMissionTelemetry();
    expect(telemetry).toHaveLength(1);
    expect(telemetry[0]!.name).toBe('repo-123');
  });

  it('should correctly resolve naming for GCE', () => {
    expect(provider.resolveWorkspaceName('repo', '123')).toBe('repo/123');
    expect(provider.resolveSessionName('repo', '123', 'chat')).toBe('repo/123');
    expect(provider.resolveContainerName('repo', '123', 'chat')).toBe(
      'repo-123',
    );
  });

  it('should correctly resolve paths for GCE', () => {
    expect(provider.resolveWorkDir('repo/ws1')).toBe(
      '/mnt/disks/data/workspaces/repo/ws1',
    );
    expect(provider.resolveWorkspacesRoot()).toBe('/mnt/disks/data/workspaces');
  });

  it('should include upstreamUrl in getStationReceipt', () => {
    const infraWithUrl = {
      projectId,
      zone,
      instanceName,
      upstreamUrl: 'https://github.com/org/repo.git',
    };
    const providerWithUrl = new GceCosProvider(
      projectCtx,
      projectId,
      zone,
      instanceName,
      repoRoot,
      mockSsh as any,
      mockPm,
      mockExecutors,
      infraWithUrl as any,
    );

    const receipt = providerWithUrl.getStationReceipt();
    expect(receipt.upstreamUrl).toBe('https://github.com/org/repo.git');
  });

  describe('Surgical Jettison', () => {
    it('should remove only specific container if action provided', async () => {
      await provider.jettisonMission('123', 'fix');

      // Should call removeCapsule for specific container
      expect(mockExecutors.docker.remove).toHaveBeenCalledWith('repo-123-fix');

      // Should remove specific secret
      expect(mockSsh.runHostCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining([
            expect.stringContaining('rm -f /dev/shm/.orbit-env-repo-123-fix'),
          ]),
        }),
        expect.objectContaining({ quiet: true }),
      );
    });

    it('should remove all containers for mission if no action provided', async () => {
      await provider.jettisonMission('123');

      // Verify all commands executed via runHostCommand
      const calls = mockSsh.runHostCommand.mock.calls;
      const commands = calls.map((c: any) => c[0].args.join(' '));

      // 1. Should use Docker list + grep + xargs for bulk cleanup
      expect(
        commands.some(
          (c: string) =>
            c.includes("grep '^repo-123'") ||
            c.includes("grep '\\''^repo-123'\\''"),
        ),
      ).toBe(true);
      expect(
        commands.some((c) => c.includes('xargs -r sudo docker rm -f')),
      ).toBe(true);

      // 2. Should use wildcard for secret cleanup
      expect(
        commands.some((c) =>
          c.includes('rm -f /dev/shm/.orbit-env-repo-123-*'),
        ),
      ).toBe(true);
    });
  });
});

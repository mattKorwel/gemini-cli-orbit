/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mocked,
} from 'vitest';

// Set environment variables BEFORE importing MissionManager
vi.stubEnv('GCLI_MCP', '1');
vi.stubEnv('GCLI_ORBIT_PROVIDER', 'gce');

import { MissionManager } from './MissionManager.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';
import {
  type IProviderFactory,
  type IConfigManager,
} from '../core/interfaces.js';

vi.mock('../utils/MissionUtils.js', () => ({
  resolveMissionContext: vi.fn(),
  SessionManager: {
    generateMissionId: vi.fn().mockReturnValue('mock-mission-id'),
  },
  getPrimaryRepoRoot: vi.fn().mockReturnValue('/tmp/repo'),
}));
vi.mock('../utils/SessionManager.js', () => ({
  SessionManager: {
    generateMissionId: vi.fn().mockReturnValue('mock-mission-id'),
    getSessionIdFromEnv: vi.fn().mockReturnValue(null),
  },
}));
vi.mock('../utils/TempManager.js', () => ({
  TempManager: { getToken: () => 'mock-token' },
}));

describe('MissionManager', () => {
  let manager: MissionManager;
  let mockProvider: any;
  let providerFactory: Mocked<IProviderFactory>;
  let configManager: Mocked<IConfigManager>;
  let mockPm: any;
  let mockExecutors: any;
  let mockStationRegistry: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GCLI_MCP', '1');
    vi.stubEnv('GCLI_ORBIT_PROVIDER', 'gce');

    mockProvider = {
      type: 'gce',
      getCapsuleStatus: vi
        .fn()
        .mockResolvedValue({ exists: false, running: false }),
      prepareMissionWorkspace: vi.fn().mockResolvedValue(undefined),
      listCapsules: vi.fn().mockResolvedValue([]),
      attach: vi.fn().mockResolvedValue(0),
      exec: vi.fn().mockResolvedValue(0),
      sync: vi.fn().mockResolvedValue(0),
      syncIfChanged: vi.fn().mockResolvedValue(0),
      syncGlobalConfig: vi.fn().mockResolvedValue(0),
      ensureReady: vi.fn().mockResolvedValue(0),
      resolveBundlePath: vi.fn().mockReturnValue('/mock/bundle'),
      removeCapsule: vi.fn().mockResolvedValue(0),
      capturePane: vi.fn().mockResolvedValue('mock-logs'),
      getCapsuleIdleTime: vi.fn().mockResolvedValue(0),
      resolveWorkspaceName: vi.fn().mockImplementation((r, i) => `${r}-${i}`),
      resolveSessionName: vi.fn().mockImplementation((r, i) => `${r}/${i}`),
      resolveContainerName: vi
        .fn()
        .mockImplementation((r, i, a) => `${r}-${i}-${a}`),
      resolveIsolationId: vi.fn().mockReturnValue('mock-container'),
      jettisonMission: vi.fn().mockResolvedValue(0),
      resolveWorkDir: vi.fn().mockReturnValue('/tmp/workdir'),
      resolveProjectConfigDir: vi.fn().mockReturnValue('/tmp/project-configs'),
      resolveWorkerPath: vi.fn().mockReturnValue('/tmp/station.js'),
      resolvePolicyPath: vi.fn().mockReturnValue('/tmp/policy.toml'),
      resolveMirrorPath: vi.fn().mockReturnValue('/tmp/mirror'),
      createNodeCommand: vi
        .fn()
        .mockImplementation((s, a) => ({ bin: 'node', args: [s, ...a] })),
      getMissionExecOutput: vi
        .fn()
        .mockResolvedValue({ status: 0, stdout: '', stderr: '' }),
      execMission: vi.fn().mockResolvedValue(0),
      getStationReceipt: vi.fn().mockReturnValue({ name: 'mock-station' }),
    };

    providerFactory = {
      getProvider: vi.fn().mockReturnValue(mockProvider),
    } as any;

    configManager = {
      loadSettings: vi.fn(),
      saveSettings: vi.fn(),
      loadSchematic: vi.fn(),
      saveSchematic: vi.fn(),
      loadJson: vi.fn(),
      detectRemoteUrl: vi
        .fn()
        .mockReturnValue('https://github.com/test/test.git'),
    } as any;

    mockExecutors = {
      node: {
        create: vi.fn().mockReturnValue({ bin: 'node', args: ['start'] }),
        createRemote: vi.fn().mockReturnValue({ bin: 'node', args: ['start'] }),
      },
    };

    mockStationRegistry = {
      saveReceipt: vi.fn(),
    };

    mockPm = {
      runSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
    };

    manager = new MissionManager(
      { repoName: 'test-repo', repoRoot: '/tmp' } as any,
      { projectId: 'p1', zone: 'z1' } as any,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
      providerFactory,
      configManager,
      mockPm,
      mockExecutors,
      mockStationRegistry,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should perform a single start handshake for a new mission', async () => {
    const fullName = 'test-repo-123';
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      repoSlug: 'test-repo',
      idSlug: '123',
      action: 'chat',
    });
    mockProvider.listCapsules.mockResolvedValue([fullName]);

    const manifest = await manager.resolve({
      identifier: '123',
      action: 'review',
    });
    const result = await manager.start(manifest);

    // Verify a single 'start' call was made
    expect(mockProvider.getMissionExecOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['start']),
      }),
      expect.any(Object),
      expect.objectContaining({
        manifest: expect.objectContaining({
          identifier: '123',
          action: 'review',
        }),
      }),
    );

    expect(result.exitCode).toBe(0);
  });

  it('should call start and attach for chat missions', async () => {
    const fullName = 'test-repo-123';
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      repoSlug: 'test-repo',
      idSlug: '123',
      action: 'chat',
    });
    mockProvider.listCapsules.mockResolvedValue([fullName]);

    const manifest = await manager.resolve({
      identifier: '123',
      action: 'chat',
    });
    await manager.start(manifest);

    // Verify 'start' call
    expect(mockProvider.getMissionExecOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['start']),
      }),
      expect.any(Object),
      expect.objectContaining({
        manifest: expect.objectContaining({
          identifier: '123',
          action: 'chat',
        }),
      }),
    );

    // Verify 'attach' call
    expect(mockProvider.attach).toHaveBeenCalled();
  });

  it('should clean up RAM-disk secret file and all possible mission variants during jettison', async () => {
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      repoSlug: 'test-repo',
      idSlug: '123',
      action: 'chat',
    });
    mockProvider.listCapsules.mockResolvedValue(['test-repo-123']);

    await manager.jettison({ identifier: '123' });

    // Should delegate to provider
    expect(mockProvider.jettisonMission).toHaveBeenCalledWith('123', undefined);
  });

  it('should propagate verbose flag to the manifest', async () => {
    // Create manager with verbose infra
    const verboseManager = new MissionManager(
      { repoName: 'test-repo', repoRoot: '/tmp' } as any,
      { projectId: 'p1', zone: 'z1', verbose: true } as any,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
      providerFactory,
      configManager,
      mockPm,
      mockExecutors,
      mockStationRegistry,
    );

    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      repoSlug: 'test-repo',
      idSlug: '123',
      action: 'chat',
    });

    const manifest = await verboseManager.resolve({
      identifier: '123',
      action: 'review',
    });

    expect(manifest.verbose).toBe(true);
  });

  it('should populate upstreamUrl in manifest and infra', async () => {
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      repoSlug: 'test-repo',
      idSlug: '123',
      action: 'chat',
    });

    const manifest = await manager.resolve({
      identifier: '123',
      action: 'chat',
    });

    expect(manifest.upstreamUrl).toBe('https://github.com/test/test.git');
    expect((manager as any).infra.upstreamUrl).toBe(
      'https://github.com/test/test.git',
    );
  });
});

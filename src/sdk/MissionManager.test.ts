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
  MISSION_PREFIX: 'orbit-',
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
      ensureReady: vi.fn().mockResolvedValue(0),
      removeCapsule: vi.fn().mockResolvedValue(0),
      capturePane: vi.fn().mockResolvedValue('mock-logs'),
      getCapsuleIdleTime: vi.fn().mockResolvedValue(0),
      resolveWorkspaceName: vi
        .fn()
        .mockImplementation((r, i) => `orbit-${r}-${i}`),
      resolveSessionName: vi
        .fn()
        .mockImplementation((r, i) => `orbit/${r}/${i}`),
      resolveContainerName: vi
        .fn()
        .mockImplementation((r, i, a) => `orbit-${r}-${i}-${a}`),
      resolveWorkDir: vi.fn().mockReturnValue('/tmp/workdir'),
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

    const mockExecutors: any = {
      node: {
        create: vi.fn().mockReturnValue({ bin: 'node', args: ['start'] }),
      },
    };

    const mockStationRegistry: any = {
      saveReceipt: vi.fn(),
    };

    manager = new MissionManager(
      { repoName: 'test-repo', repoRoot: '/tmp' } as any,
      { projectId: 'p1', zone: 'z1' } as any,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
      providerFactory,
      configManager,
      mockExecutors,
      mockStationRegistry,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should perform a single start handshake for a new mission', async () => {
    const fullName = 'orbit-123';
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      repoSlug: 'test-repo',
      idSlug: '123',
    });
    mockProvider.listCapsules.mockResolvedValue([fullName]);

    const result = await manager.start({ identifier: '123', action: 'review' });

    // Verify a single 'start' call was made
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['start']),
      }),
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
    const fullName = 'orbit-123';
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      repoSlug: 'test-repo',
      idSlug: '123',
    });
    mockProvider.listCapsules.mockResolvedValue([fullName]);

    await manager.start({ identifier: '123', action: 'chat' });

    // Verify 'start' call
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['start']),
      }),
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
    });
    mockProvider.listCapsules.mockResolvedValue(['orbit-123']);

    await manager.jettison({ identifier: '123' });

    // Should attempt to remove variants
    expect(mockProvider.removeCapsule).toHaveBeenCalled();

    // Should cleanup secrets
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.stringContaining('rm -f /dev/shm/.orbit-env-'),
      expect.any(Object),
    );
  });
});

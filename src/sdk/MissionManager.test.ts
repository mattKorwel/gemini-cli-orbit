/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set environment variables BEFORE importing MissionManager
vi.stubEnv('GCLI_MCP', '1');
vi.stubEnv('GCLI_ORBIT_PROVIDER', 'gce');

import { MissionManager } from './MissionManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';

vi.mock('../providers/ProviderFactory.js');
vi.mock('../utils/MissionUtils.js', () => ({
  resolveMissionContext: vi.fn(),
  SessionManager: {
    generateMissionId: vi.fn().mockReturnValue('mock-mission-id'),
  },
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
vi.mock('../core/ConfigManager.js', () => ({
  detectRemoteUrl: vi.fn().mockReturnValue('https://github.com/test/test.git'),
}));

describe('MissionManager', () => {
  let manager: MissionManager;
  let mockProvider: any;

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
      ensureReady: vi.fn().mockResolvedValue(0),
    };
    (ProviderFactory.getProvider as any).mockReturnValue(mockProvider);

    manager = new MissionManager(
      { repoName: 'test-repo', repoRoot: '/tmp' } as any,
      { projectId: 'p1', zone: 'z1' } as any,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should perform chunky handshake (init then run) for a new mission', async () => {
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      containerName: 'orbit-feat-review',
      sessionName: 'orbit-feat',
      workspaceName: 'mission-feat-review',
    });
    mockProvider.listCapsules.mockResolvedValue(['orbit-feat-review']);

    const result = await manager.start({ identifier: '123', action: 'review' });

    // 1. Verify init call
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.stringContaining('station.js init 123 feat'),
      expect.objectContaining({ wrapCapsule: 'orbit-feat-review' }),
    );

    // 2. Verify run call
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.stringContaining('station.js run 123 feat review'),
      expect.objectContaining({ wrapCapsule: 'orbit-feat-review' }),
    );

    expect(result.exitCode).toBe(0);
  });

  it('should auto-attach for CLI users (non-MCP)', async () => {
    vi.stubEnv('GCLI_MCP', '0');
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      containerName: 'orbit-feat-chat',
      sessionName: 'orbit-feat',
      workspaceName: 'mission-feat-chat',
    });
    mockProvider.listCapsules.mockResolvedValue(['orbit-feat-chat']);

    const result = await manager.start({ identifier: '123', action: 'chat' });

    expect(mockProvider.attach).toHaveBeenCalledWith('orbit-feat-chat');
    expect(result.exitCode).toBe(0);
  });

  it('should skip run phase for chat action (it only needs init)', async () => {
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      containerName: 'orbit-feat-chat',
      sessionName: 'orbit-feat',
      workspaceName: 'mission-feat-chat',
    });
    mockProvider.listCapsules.mockResolvedValue(['orbit-feat-chat']);

    await manager.start({ identifier: '123', action: 'chat' });

    // Should call init
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.stringContaining('station.js init 123 feat'),
      expect.any(Object),
    );

    // Should NOT call run
    expect(mockProvider.exec).not.toHaveBeenCalledWith(
      expect.stringContaining('station.js run 123 feat chat'),
      expect.any(Object),
    );
  });
});

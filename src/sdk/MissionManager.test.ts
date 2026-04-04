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
vi.mock('../core/ConfigManager.js', () => ({
  detectRemoteUrl: vi.fn().mockReturnValue('https://github.com/test/test.git'),
  getProjectOrbitDir: () => '/tmp/.gemini/orbit',
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
      syncIfChanged: vi.fn().mockResolvedValue(0),
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

  it('should perform chunky handshake (init, hooks, then run) for a new mission', async () => {
    const fullName = 'orbit-123-review';
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      containerName: fullName,
      sessionName: fullName,
      workspaceName: fullName,
    });
    mockProvider.listCapsules.mockResolvedValue([fullName]);

    const result = await manager.start({ identifier: '123', action: 'review' });

    // 1. Verify init call
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['init', '123', 'feat']),
      }),
      expect.any(Object),
    );

    // 2. Verify hooks call
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['setup-hooks']),
      }),
      expect.any(Object),
    );

    // 3. Verify run call
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['run', '123', 'feat', 'review']),
      }),
      expect.any(Object),
    );

    expect(result.exitCode).toBe(0);
  });

  it('should run both init and run phases for chat action in the new architecture', async () => {
    const fullName = 'orbit-123-chat';
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      containerName: fullName,
      sessionName: fullName,
      workspaceName: fullName,
    });
    mockProvider.listCapsules.mockResolvedValue([fullName]);

    await manager.start({ identifier: '123', action: 'chat' });

    // Should call init
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['init', '123', 'feat']),
      }),
      expect.any(Object),
    );

    // Should ALSO call run now (to start entrypoint/doctor)
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['run', '123', 'feat', 'chat']),
      }),
      expect.any(Object),
    );
  });
});

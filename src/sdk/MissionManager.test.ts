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

  it('should start a new mission and auto-attach if action is chat', async () => {
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      containerName: 'orbit-feat-chat',
      sessionName: 'orbit-feat',
      workspaceName: 'mission-feat-chat',
    });
    mockProvider.getCapsuleStatus.mockResolvedValue({
      exists: false,
      running: false,
    });
    mockProvider.listCapsules.mockResolvedValue(['orbit-feat-chat']);

    const result = await manager.start({ identifier: '123', action: 'chat' });

    expect(mockProvider.prepareMissionWorkspace).toHaveBeenCalled();
    expect(mockProvider.attach).toHaveBeenCalledWith('orbit-feat-chat');
    expect(result.exitCode).toBe(0);
  });

  it('should auto-attach for CLI users (non-MCP)', async () => {
    vi.stubEnv('GCLI_MCP', '0'); // Explicitly disable MCP
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

  it('should execute the worker for autonomous actions (review)', async () => {
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      containerName: 'orbit-feat-review',
      sessionName: 'orbit-feat',
      workspaceName: 'mission-feat-review',
    });
    mockProvider.listCapsules.mockResolvedValue(['orbit-feat-review']);

    const result = await manager.start({ identifier: '123', action: 'review' });

    // Verify worker command execution
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.stringContaining('station.js 123 feat'),
      expect.objectContaining({
        wrapCapsule: 'orbit-feat-review',
      }),
    );
    // Should also auto-attach after the worker finishes
    expect(mockProvider.attach).toHaveBeenCalledWith('orbit-feat-review');
    expect(result.exitCode).toBe(0);
  });

  it('should skip setup and resume if capsule already exists for chat', async () => {
    (resolveMissionContext as any).mockReturnValue({
      branchName: 'feat',
      containerName: 'orbit-feat-chat',
      sessionName: 'orbit-feat',
      workspaceName: 'mission-feat-chat',
    });
    mockProvider.getCapsuleStatus.mockResolvedValue({
      exists: true,
      running: true,
    });
    mockProvider.listCapsules.mockResolvedValue(['orbit-feat-chat']);

    const result = await manager.start({ identifier: '123', action: 'chat' });

    expect(mockProvider.prepareMissionWorkspace).not.toHaveBeenCalled();
    expect(mockProvider.attach).toHaveBeenCalledWith('orbit-feat-chat');
    expect(result.exitCode).toBe(0);
  });

  it('should use exact matching for attach targeting', async () => {
    mockProvider.listCapsules.mockResolvedValue([
      'orbit-123-chat',
      'orbit-123-debug-chat',
    ]);

    (resolveMissionContext as any).mockReturnValue({
      containerName: 'orbit-123-debug-chat',
    });

    await manager.attach({ identifier: '123:debug', action: 'chat' });
    expect(mockProvider.attach).toHaveBeenCalledWith('orbit-123-debug-chat');
  });
});

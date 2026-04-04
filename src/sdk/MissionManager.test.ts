/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.GCLI_MCP = '1';
  process.env.GCLI_ORBIT_PROVIDER = 'gce';
});

import { MissionManager } from './MissionManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';

vi.mock('../providers/ProviderFactory.js');
vi.mock('../utils/MissionUtils.js', () => ({
  resolveMissionContext: vi.fn(),
}));
vi.mock('../utils/TempManager.js', () => ({
  TempManager: { getToken: () => 'mock-token' },
}));

describe('MissionManager', () => {
  let manager: MissionManager;
  let mockProvider: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GCLI_MCP = '1';
    process.env.GCLI_ORBIT_PROVIDER = 'gce';

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
    // IMPORTANT: attach() needs to see the capsule in the list to trigger provider.attach
    mockProvider.listCapsules.mockResolvedValue(['orbit-feat-chat']);

    const result = await manager.start({ identifier: '123', action: 'chat' });

    expect(process.env.GCLI_MCP).toBe('1');
    expect(mockProvider.prepareMissionWorkspace).toHaveBeenCalled();
    expect(mockProvider.attach).toHaveBeenCalledWith('orbit-feat-chat');
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

    // Should NOT prepare workspace again
    expect(mockProvider.prepareMissionWorkspace).not.toHaveBeenCalled();
    // Should immediately attach
    expect(mockProvider.attach).toHaveBeenCalledWith('orbit-feat-chat');
    expect(result.exitCode).toBe(0);
  });

  it('should use exact matching for attach targeting', async () => {
    mockProvider.listCapsules.mockResolvedValue([
      'orbit-123-chat',
      'orbit-123-debug-chat',
    ]);

    // Target the debug one specifically
    (resolveMissionContext as any).mockReturnValue({
      containerName: 'orbit-123-debug-chat',
    });

    await manager.attach({ identifier: '123:debug', action: 'chat' });
    expect(mockProvider.attach).toHaveBeenCalledWith('orbit-123-debug-chat');
  });
});

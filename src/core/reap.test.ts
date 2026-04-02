/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runReap } from './reap.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import * as ConfigManager from './ConfigManager.js';

vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');

describe('runReap', () => {
  const mockProvider = {
    getStatus: vi
      .fn()
      .mockResolvedValue({ status: 'RUNNING', internalIp: '10.0.0.1' }),
    listCapsules: vi.fn().mockResolvedValue([]),
    getCapsuleIdleTime: vi.fn().mockResolvedValue(0),
    removeCapsule: vi.fn().mockResolvedValue(0),
    stationName: 'test-station',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(ProviderFactory, 'getProvider').mockReturnValue(
      mockProvider as any,
    );
    (ConfigManager.detectRepoName as any).mockReturnValue('test-repo');
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      projectId: 'p',
    } as any);
  });

  it('should return 0 when no capsules exist', async () => {
    const res = await runReap();
    expect(res).toBe(0);
    expect(mockProvider.listCapsules).toHaveBeenCalled();
  });

  it('should identify and reap idle capsules', async () => {
    mockProvider.listCapsules.mockResolvedValue([
      'orbit-123-mission',
      'orbit-456-mission',
    ]);
    // 123 is active (1 hour idle), 456 is idle (5 hours idle > 4h default)
    mockProvider.getCapsuleIdleTime.mockResolvedValueOnce(3600); // 1h in seconds
    mockProvider.getCapsuleIdleTime.mockResolvedValueOnce(18000); // 5h in seconds

    const res = await runReap();
    expect(res).toBe(0);
    expect(mockProvider.removeCapsule).toHaveBeenCalledWith(
      'orbit-456-mission',
    );
    expect(mockProvider.removeCapsule).not.toHaveBeenCalledWith(
      'orbit-123-mission',
    );
  });

  it('should respect custom threshold flag', async () => {
    mockProvider.listCapsules.mockResolvedValue(['orbit-123-mission']);
    mockProvider.getCapsuleIdleTime.mockResolvedValue(7200); // 2 hours

    await runReap({ threshold: 1 });
    // Verify it reaped because threshold is 1h and idle is 2h
    expect(mockProvider.removeCapsule).toHaveBeenCalledWith(
      'orbit-123-mission',
    );
  });
});

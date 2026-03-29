/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runReap } from './reap.js';
import { ProviderFactory } from './providers/ProviderFactory.js';
import * as ConfigManager from './ConfigManager.js';
import * as Splashdown from './splashdown.js';
import readline from 'node:readline';

vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');
vi.mock('./splashdown.js');
vi.mock('node:readline');

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

  const mockRl = {
    question: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider as any);
    vi.mocked(ConfigManager.detectRepoName).mockReturnValue('test-repo');
    vi.mocked(ConfigManager.getRepoConfig).mockReturnValue({
      projectId: 'p',
    } as any);
    vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);
  });

  it('should return 0 when no capsules exist', async () => {
    const res = await runReap();
    expect(res).toBe(0);
    expect(mockProvider.listCapsules).toHaveBeenCalled();
  });

  it('should identify and reap idle capsules', async () => {
    mockProvider.listCapsules.mockResolvedValue([
      'gcli-123-mission',
      'gcli-456-mission',
    ]);
    // 123 is active (1 hour idle), 456 is idle (5 hours idle > 4h default)
    mockProvider.getCapsuleIdleTime.mockResolvedValueOnce(3600);
    mockProvider.getCapsuleIdleTime.mockResolvedValueOnce(18000);

    // Mock confirmation for reaping
    mockRl.question.mockImplementation((_q, cb) => cb('y'));

    const res = await runReap();
    expect(res).toBe(0);
    expect(mockProvider.removeCapsule).toHaveBeenCalledWith('gcli-456-mission');
    expect(mockProvider.removeCapsule).not.toHaveBeenCalledWith(
      'gcli-123-mission',
    );
  });

  it('should offer to splashdown if all capsules are reaped', async () => {
    mockProvider.listCapsules.mockResolvedValueOnce(['gcli-456-mission']); // Initial
    mockProvider.listCapsules.mockResolvedValueOnce([]); // After reap check
    mockProvider.getCapsuleIdleTime.mockResolvedValue(18000); // 5 hours

    // Confirmation for reaping AND for splashdown
    mockRl.question.mockImplementation((_q, cb) => cb('y'));
    vi.mocked(Splashdown.runSplashdown).mockResolvedValue(0);

    const res = await runReap();
    expect(res).toBe(0);
    expect(Splashdown.runSplashdown).toHaveBeenCalled();
  });

  it('should respect custom threshold flag', async () => {
    mockProvider.listCapsules.mockResolvedValue(['gcli-123-mission']);
    mockProvider.getCapsuleIdleTime.mockResolvedValue(7200); // 2 hours > 1 hour

    mockRl.question.mockImplementation((_q, cb) => cb('n')); // Decline reap

    await runReap({ threshold: 1 });
    // Verify threshold was calculated as 1 hour (3600s)
    // If it used 4h default, it wouldn't have asked to reap.
    expect(mockRl.question).toHaveBeenCalledWith(
      expect.stringContaining('Jettison all idle capsules?'),
      expect.any(Function),
    );
  });
});

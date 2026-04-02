/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSplashdown } from './splashdown.js';
import * as ConfigManager from './ConfigManager.js';

const mockSplashdown = vi.fn().mockResolvedValue(0);

vi.mock('./OrbitSDK.js', () => ({
  OrbitSDK: vi.fn().mockImplementation(() => ({
    splashdown: mockSplashdown,
  })),
}));

vi.mock('./ConfigManager.js');

describe('runSplashdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ConfigManager.detectRepoName as any).mockReturnValue('repo');
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      instanceName: 'test-i',
    });
  });

  it('should perform repository splashdown when called without --all', async () => {
    const res = await runSplashdown([]);
    expect(res).toBe(0);
    expect(mockSplashdown).toHaveBeenCalledWith({ all: false });
  });

  it('should call splashdown with all true when --all is present', async () => {
    const res = await runSplashdown(['--all']);
    expect(res).toBe(0);
    expect(mockSplashdown).toHaveBeenCalledWith({ all: true });
  });
});

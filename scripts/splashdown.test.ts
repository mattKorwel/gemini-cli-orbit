/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSplashdown } from './splashdown.js';
import { ProviderFactory } from './providers/ProviderFactory.js';
import * as ConfigManager from './ConfigManager.js';

vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');

describe('runSplashdown', () => {
  const mockProvider = {
    exec: vi.fn().mockResolvedValue(0),
    stop: vi.fn().mockResolvedValue(0),
    removeCapsule: vi.fn().mockResolvedValue(0),
    listCapsules: vi.fn().mockResolvedValue(['gcli-23176-open']),
    getExecOutput: vi
      .fn()
      .mockResolvedValue({ status: 0, stdout: 'gcli-23176-open', stderr: '' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider as any);

    vi.mocked(ConfigManager.detectRepoName).mockReturnValue(
      'gemini-orbit-extension',
    );
    vi.mocked(ConfigManager.getRepoConfig).mockReturnValue({
      projectId: 'p',
      zone: 'z',
      instanceName: 'i',
      repoName: 'gemini-orbit-extension',
    });
  });

  it('should perform repository splashdown when called without --all', async () => {
    const res = await runSplashdown([]);

    expect(res).toBe(0);
    expect(mockProvider.listCapsules).toHaveBeenCalled();
    expect(mockProvider.removeCapsule).toHaveBeenCalledWith('gcli-23176-open');
    expect(mockProvider.stop).not.toHaveBeenCalled();
  });

  it('should perform global mission splashdown when --all is present', async () => {
    const res = await runSplashdown(['--all']);

    expect(res).toBe(0);
    expect(mockProvider.listCapsules).toHaveBeenCalled();
    expect(mockProvider.removeCapsule).toHaveBeenCalled();
    expect(mockProvider.stop).toHaveBeenCalled();
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSplashdown } from './splashdown.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import * as ConfigManager from './ConfigManager.js';

vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');

describe('runSplashdown (Remote Mode)', () => {
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
    (ProviderFactory.getProvider as any).mockReturnValue(mockProvider as any);

    (ConfigManager.detectRepoName as any).mockReturnValue(
      'gemini-orbit-extension',
    );
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      projectId: 'remote-project',
      zone: 'us-central1-a',
      instanceName: 'prod-station',
      repoName: 'gemini-orbit-extension',
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should call stop() when --all is present in remote mode', async () => {
    const res = await runSplashdown(['--all']);

    expect(res).toBe(0);
    expect(mockProvider.stop).toHaveBeenCalled();
  });
});

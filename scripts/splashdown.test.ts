/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSplashdown } from './splashdown.js';
import { ProviderFactory } from './providers/ProviderFactory.js';
import * as ConfigManager from './ConfigManager.js';
import readline from 'node:readline';

vi.mock('node:readline');
vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');

describe('runSplashdown', () => {
  const mockProvider = {
    exec: vi.fn().mockResolvedValue(0),
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

    vi.mocked(readline.createInterface).mockReturnValue({
      question: vi.fn().mockImplementation((q, cb) => cb('y')),
      close: vi.fn(),
    } as any);
  });

  it('should perform repository splashdown when called without --all', async () => {
    const res = await runSplashdown([]);

    expect(res).toBe(0);
    expect(readline.createInterface).toHaveBeenCalled();
    expect(mockProvider.getExecOutput).toHaveBeenCalledWith(
      expect.stringContaining('docker ps'),
      expect.any(Object),
    );
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.stringContaining('docker rm -f'),
    );
    expect(mockProvider.exec).not.toHaveBeenCalledWith(
      expect.stringContaining('station-supervisor'),
    );
  });

  it('should perform global mission splashdown when --all is present', async () => {
    const res = await runSplashdown(['--all']);

    expect(res).toBe(0);
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.stringContaining('station-supervisor'),
    );
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.stringContaining('rm -rf /mnt/disks/data/worktrees/*'),
    );
  });
});

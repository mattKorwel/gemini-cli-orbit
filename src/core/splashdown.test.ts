/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSplashdown } from './splashdown.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import * as ConfigManager from './ConfigManager.js';
import readline from 'node:readline';

vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');
vi.mock('node:readline');

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
    (ProviderFactory.getProvider as any).mockReturnValue(mockProvider as any);

    (ConfigManager.detectRepoName as any).mockReturnValue(
      'gemini-orbit-extension',
    );
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      projectId: 'local',
      zone: 'localhost',
      instanceName: 'i',
      repoName: 'gemini-orbit-extension',
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should perform repository splashdown when called without --all', async () => {
    const res = await runSplashdown([]);

    expect(res).toBe(0);
    expect(mockProvider.listCapsules).toHaveBeenCalled();
    expect(mockProvider.removeCapsule).toHaveBeenCalledWith('gcli-23176-open');
    expect(mockProvider.stop).not.toHaveBeenCalled();
  });

  it('should not call stop() even if --all is present in local mode', async () => {
    const res = await runSplashdown(['--all']);

    expect(res).toBe(0);
    expect(mockProvider.listCapsules).toHaveBeenCalled();
    expect(mockProvider.removeCapsule).toHaveBeenCalled();
    expect(mockProvider.stop).not.toHaveBeenCalled();
  });

  it('should perform local cleanup when --force-local-cleanup-i-undestand is confirmed', async () => {
    const mockInterface = {
      question: vi
        .fn()
        .mockImplementationOnce((_q, cb) => cb('yes'))
        .mockImplementationOnce((_q, cb) => cb('gemini-orbit-extension')),
      close: vi.fn(),
    };
    ( readline.createInterface as any).mockReturnValue(mockInterface as any);

    const res = await runSplashdown(['--force-local-cleanup-i-undestand']);

    expect(res).toBe(0);
    expect(mockInterface.question).toHaveBeenCalledTimes(2);
    expect(mockProvider.removeCapsule).toHaveBeenCalled();
  });

  it('should abort local cleanup if confirmation fails', async () => {
    const mockInterface = {
      question: vi.fn().mockImplementationOnce((_q, cb) => cb('no')),
      close: vi.fn(),
    };
    ( readline.createInterface as any).mockReturnValue(mockInterface as any);

    const res = await runSplashdown(['--force-local-cleanup-i-undestand']);

    expect(res).toBe(0);
    expect(mockProvider.removeCapsule).not.toHaveBeenCalled();
  });
});

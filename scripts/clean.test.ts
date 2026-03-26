/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCleanup } from './clean.ts';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import * as ConfigManager from './ConfigManager.ts';
import fs from 'node:fs';
import readline from 'node:readline';

vi.mock('node:fs');
vi.mock('node:readline');
vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');

describe('runCleanup', () => {
  const mockProvider = {
    exec: vi.fn().mockResolvedValue(0),
    removeContainer: vi.fn().mockResolvedValue(0),
    getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: 'gcli-23176-open', stderr: '' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider as any);
    
    vi.mocked(ConfigManager.detectRepoName).mockReturnValue('gemini-workspaces-extension');
    vi.mocked(ConfigManager.getRepoConfig).mockReturnValue({
        projectId: 'p',
        zone: 'z',
        instanceName: 'i',
        repoName: 'gemini-workspaces-extension',
        terminalTarget: 'tab',
        userFork: 'u/f',
        upstreamRepo: 'o/r',
        remoteHost: 'h',
        remoteWorkDir: '/w',
        useContainer: true
    });

    vi.mocked(readline.createInterface).mockReturnValue({
      question: vi.fn().mockImplementation((q, cb) => cb('y')),
      close: vi.fn(),
    } as any);
  });

  it('should perform surgical cleanup for a specific PR', async () => {
    const res = await runCleanup(['23176', 'open']);
    
    expect(res).toBe(0);
    expect(mockProvider.removeContainer).toHaveBeenCalledWith('gcli-23176-open');
    expect(mockProvider.exec).toHaveBeenCalledWith(expect.stringContaining('rm -rf'));
  });

  it('should return non-zero if surgical cleanup fails', async () => {
    mockProvider.removeContainer.mockResolvedValue(1);
    const res = await runCleanup(['23176', 'open']);
    expect(res).toBe(1);
  });

  it('should perform bulk cleanup when no arguments provided', async () => {
    await runCleanup([]);
    
    expect(readline.createInterface).toHaveBeenCalled();
    expect(mockProvider.getExecOutput).toHaveBeenCalledWith(expect.stringContaining('docker ps'), expect.any(Object));
    expect(mockProvider.exec).toHaveBeenCalledWith(expect.stringContaining('docker rm -f'));
  });
});

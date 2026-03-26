/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runJettison } from './jettison.ts';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import * as ConfigManager from './ConfigManager.ts';
import readline from 'node:readline';

vi.mock('node:readline');
vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');

describe('runJettison', () => {
  const mockProvider = {
    exec: vi.fn().mockResolvedValue(0),
    removeCapsule: vi.fn().mockResolvedValue(0),
    getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: 'gcli-23176-open', stderr: '' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider as any);
    
    vi.mocked(ConfigManager.detectRepoName).mockReturnValue('gemini-orbits-extension');
    vi.mocked(ConfigManager.getRepoConfig).mockReturnValue({
        projectId: 'p',
        zone: 'z',
        instanceName: 'i',
        repoName: 'gemini-orbits-extension',
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

  it('should perform surgical jettison for a specific PR', async () => {
    const res = await runJettison(['23176', 'open']);
    
    expect(res).toBe(0);
    expect(mockProvider.removeCapsule).toHaveBeenCalledWith('gcli-23176-open');
    expect(mockProvider.exec).toHaveBeenCalledWith(expect.stringContaining('rm -rf'));
  });

  it('should return non-zero if jettison fails', async () => {
    mockProvider.removeCapsule.mockResolvedValue(1);
    const res = await runJettison(['23176', 'open']);
    expect(res).toBe(1);
  });
});

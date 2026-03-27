/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runLogs } from './logs.js';
import { ProviderFactory } from './providers/ProviderFactory.js';
import * as ConfigManager from './ConfigManager.js';


vi.mock('node:fs');
vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');

describe('runLogs', () => {
  const mockProvider = {
    getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: 'mock-logs', stderr: '' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider as any);
    
    vi.mocked(ConfigManager.detectRepoName).mockReturnValue('gemini-orbit-extension');
    vi.mocked(ConfigManager.getRepoConfig).mockReturnValue({
        projectId: 'p',
        zone: 'z',
        instanceName: 'i',
        repoName: 'gemini-orbit-extension',
        terminalTarget: 'tab',
        userFork: 'u/f',
        upstreamRepo: 'o/r',
        remoteHost: 'h',
        remoteWorkDir: '/w',
    });
  });

  it('should fetch and display logs for a PR', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runLogs(['23176']);
    
    expect(mockProvider.getExecOutput).toHaveBeenCalledWith(
        expect.stringContaining('tail -n 50'),
        expect.any(Object)
    );
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('mock-logs'));
  });
});

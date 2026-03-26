/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runLogs } from './logs.ts';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import * as ConfigManager from './ConfigManager.ts';
import fs from 'node:fs';

vi.mock('node:fs');
vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');

describe('runLogs', () => {
  const mockProvider = {
    getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: 'mock-logs', stderr: '' }),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ProviderFactory, 'getProvider').mockReturnValue(mockProvider as any);
    
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

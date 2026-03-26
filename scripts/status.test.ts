/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runStatus } from './status.ts';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import * as ConfigManager from './ConfigManager.ts';
import fs from 'node:fs';

vi.mock('node:fs');
vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');

describe('runStatus', () => {
  const mockProvider = {
    getStatus: vi.fn().mockResolvedValue({ status: 'RUNNING', internalIp: '10.0.0.1' }),
    getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: '' }),
    capturePane: vi.fn().mockResolvedValue(''),
    listCapsules: vi.fn().mockResolvedValue([]),
    stationName: 'gcli-station-repo',
    projectId: 'p',
    zone: 'z'
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
        useCapsule: true
    });
  });

  it('should return 0 when station is running', async () => {
    const res = await runStatus();
    expect(res).toBe(0);
    expect(mockProvider.getStatus).toHaveBeenCalled();
  });

  it('should return 1 when station is in invalid state', async () => {
    mockProvider.getStatus.mockResolvedValue({ status: 'UNKNOWN' });
    const res = await runStatus();
    expect(res).toBe(1);
  });
});

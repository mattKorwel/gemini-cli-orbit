/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runStatus } from './status.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import * as ConfigManager from './ConfigManager.js';

vi.mock('node:fs');
vi.mock('../providers/ProviderFactory.js');
vi.mock('./ConfigManager.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    detectRepoName: vi.fn(),
    getRepoConfig: vi.fn(),
    loadProjectConfig: vi.fn().mockReturnValue({}),
  };
});

describe('runStatus', () => {
  const mockProvider = {
    getStatus: vi
      .fn()
      .mockResolvedValue({ status: 'RUNNING', internalIp: '10.0.0.1' }),
    getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: '' }),
    capturePane: vi.fn().mockResolvedValue(''),
    listCapsules: vi.fn().mockResolvedValue([]),
    stationName: 'orbit-station-repo',
    projectId: 'p',
    zone: 'z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(ProviderFactory, 'getProvider').mockReturnValue(
      mockProvider as any,
    );

    (ConfigManager.detectRepoName as any).mockReturnValue(
      'gemini-orbit-extension',
    );
    (ConfigManager.getRepoConfig as any).mockReturnValue({
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

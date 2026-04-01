/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runJettison } from './jettison.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import * as ConfigManager from './ConfigManager.js';
import readline from 'node:readline';

vi.mock('node:readline');
vi.mock('../providers/ProviderFactory.js');
vi.mock('./ConfigManager.js');

describe('runJettison', () => {
  const mockProvider = {
    exec: vi.fn().mockResolvedValue(0),
    getCapsuleStatus: vi.fn().mockResolvedValue({ exists: true }),
    listCapsules: vi.fn().mockResolvedValue(['gcli-23176-chat']),
    stopCapsule: vi.fn().mockResolvedValue(0),
    removeCapsule: vi.fn().mockResolvedValue(0),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(ProviderFactory, 'getProvider').mockReturnValue(mockProvider as any);

    (ConfigManager.detectRepoName as any).mockReturnValue(
      'gemini-orbit-extension',
    );
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      projectId: 'p',
      zone: 'z',
      repoName: 'gemini-orbit-extension',
    });
  });

  it('should perform surgical jettison for a specific PR', async () => {
    const mockInterface = {
      question: vi.fn().mockImplementation((_q, cb) => cb('y')),
      close: vi.fn(),
    };
    (readline.createInterface as any).mockReturnValue(mockInterface);

    const res = await runJettison('23176', 'chat', []);
    expect(res).toBe(0);
    expect(mockProvider.removeCapsule).toHaveBeenCalledWith('gcli-23176-chat');
  });

  it('should return non-zero if jettison fails', async () => {
    mockProvider.removeCapsule.mockRejectedValue(new Error('fail'));
    const mockInterface = {
      question: vi.fn().mockImplementation((_q, cb) => cb('y')),
      close: vi.fn(),
    };
    (readline.createInterface as any).mockReturnValue(mockInterface);

    const res = await runJettison('23176', 'chat', []);
    expect(res).toBe(1);
  });
});

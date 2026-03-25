/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCleanup } from './clean.ts';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import fs from 'node:fs';
import readline from 'node:readline';

vi.mock('node:fs');
vi.mock('node:readline');
vi.mock('./providers/ProviderFactory.ts');

describe('runCleanup', () => {
  const mockProvider = {
    exec: vi.fn().mockResolvedValue(0),
    removeContainer: vi.fn().mockResolvedValue(0),
    getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: 'gcli-23176-open', stderr: '' }),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ProviderFactory, 'getProvider').mockReturnValue(mockProvider as any);
    
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      workspace: { projectId: 'p', zone: 'z' }
    }));

    vi.mocked(readline.createInterface).mockReturnValue({
      question: vi.fn().mockImplementation((q, cb) => cb('y')),
      close: vi.fn(),
    } as any);
  });

  it('should perform surgical cleanup for a specific PR', async () => {
    await runCleanup(['23176', 'open']);
    
    expect(mockProvider.removeContainer).toHaveBeenCalledWith('gcli-23176-open');
    expect(mockProvider.exec).toHaveBeenCalledWith(expect.stringContaining('rm -rf'));
  });

  it('should perform bulk cleanup when no arguments provided', async () => {
    await runCleanup([]);
    
    expect(readline.createInterface).toHaveBeenCalled();
    expect(mockProvider.getExecOutput).toHaveBeenCalledWith(expect.stringContaining('docker ps'), expect.any(Object));
    expect(mockProvider.exec).toHaveBeenCalledWith(expect.stringContaining('docker rm -f'));
  });
});

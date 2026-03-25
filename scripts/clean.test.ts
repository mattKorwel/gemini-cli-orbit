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
    
    expect(mockProvider.exec).toHaveBeenCalledWith(
        expect.stringContaining('workspace-23176-open'),
        expect.any(Object)
    );
    // Should NOT trigger bulk cleanup confirm
    expect(readline.createInterface).not.toHaveBeenCalled();
  });

  it('should perform bulk cleanup when no arguments provided', async () => {
    await runCleanup([]);
    
    expect(readline.createInterface).toHaveBeenCalled();
    expect(mockProvider.exec).toHaveBeenCalledWith(
        expect.stringContaining('tmux kill-server'),
        expect.any(Object)
    );
    expect(mockProvider.exec).toHaveBeenCalledWith(
        expect.stringContaining('rm -rf /mnt/disks/data/main'),
        expect.any(Object)
    );
  });
});

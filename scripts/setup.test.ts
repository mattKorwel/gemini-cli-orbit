/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSetup } from './setup.ts';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('node:readline');
vi.mock('./providers/ProviderFactory.ts');

describe('runSetup', () => {
  const mockProvider = {
    getStatus: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
    ensureReady: vi.fn().mockResolvedValue(0),
    setup: vi.fn().mockResolvedValue(0),
    exec: vi.fn().mockResolvedValue(0),
    sync: vi.fn().mockResolvedValue(0),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ProviderFactory, 'getProvider').mockReturnValue(mockProvider as any);
    
    // Default mock for readline
    vi.mocked(readline.createInterface).mockReturnValue({
      question: vi.fn().mockImplementation((q, cb) => cb('')),
      close: vi.fn(),
    } as any);

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: Buffer.from('{}') } as any);
  });

  it('should run setup flow and use sync for scripts', async () => {
    // We pass --yes to skip interactive prompts and provide a mock token
    const res = await runSetup({ 
        ...process.env, 
        GOOGLE_CLOUD_PROJECT: 'test-p',
        WORKSPACE_GH_TOKEN: 'mock-token'
    });
    
    expect(res).toBe(0);
    expect(mockProvider.setup).toHaveBeenCalled();
    // Verify sync was called for scripts folder
    expect(mockProvider.sync).toHaveBeenCalledWith(
        expect.stringContaining('scripts/'),
        expect.stringContaining('/mnt/disks/data/scripts/'),
        expect.objectContaining({ delete: true, sudo: true })
    );
  });

  it('should detect existing configuration', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      workspace: { projectId: 'p', zone: 'z' }
    }));

    // Mock confirm to say yes to using existing config
    const rl = {
        question: vi.fn().mockImplementation((q, cb) => cb('y')),
        close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(rl as any);

    const res = await runSetup({ ...process.env, WORKSPACE_GH_TOKEN: 'mock-token' });
    expect(res).toBe(0);
    
    // Should skip some configuration prompts but still run execution phases
    expect(mockProvider.setup).toHaveBeenCalled();
  });
});

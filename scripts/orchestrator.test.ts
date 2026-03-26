/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOrchestrator } from './orchestrator.ts';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import { RemoteProvisioner } from './RemoteProvisioner.ts';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('./providers/ProviderFactory.ts');

const mockProvisionWorktree = vi.fn().mockResolvedValue('/remote/path');
vi.mock('./RemoteProvisioner.ts', () => {
  return {
    RemoteProvisioner: function() {
      return {
        provisionWorktree: mockProvisionWorktree,
      };
    },
  };
});

describe('runOrchestrator', () => {
  const mockProvider = {
    ensureReady: vi.fn().mockResolvedValue(0),
    getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: 'node' }),
    exec: vi.fn().mockResolvedValue(0),
    sync: vi.fn().mockResolvedValue(0),
    getRunCommand: vi.fn().mockReturnValue('ssh-command'),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ProviderFactory, 'getProvider').mockReturnValue(mockProvider as any);
    
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      workspace: { projectId: 'p', zone: 'z' }
    }));
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    mockProvisionWorktree.mockResolvedValue('/remote/path');
  });

  it('should return 0 on successful orchestration', async () => {
    const res = await runOrchestrator(['23176', 'open']);
    expect(res).toBe(0);
    expect(mockProvider.ensureReady).toHaveBeenCalled();
  });

  it('should return non-zero if infrastructure fails', async () => {
    mockProvider.ensureReady.mockResolvedValue(1);
    const res = await runOrchestrator(['23176', 'open']);
    expect(res).toBe(1);
  });

  it('should return non-zero if worktree provisioning fails', async () => {
    mockProvisionWorktree.mockResolvedValue('');
    const res = await runOrchestrator(['23176', 'open']);
    expect(res).toBe(1);
  });

  it('should return non-zero if credential injection fails', async () => {
    mockProvider.exec.mockResolvedValue(1);
    const res = await runOrchestrator(['23176', 'open'], { WORKSPACE_GEMINI_API_KEY: 'test-key' });
    expect(res).toBe(1);
  });
});

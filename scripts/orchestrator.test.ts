/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOrchestrator } from './orchestrator.ts';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import fs from 'node:fs';

vi.mock('node:fs');
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0 }),
}));

describe('runOrchestrator', () => {
  const mockProvider = {
    ensureReady: vi.fn().mockResolvedValue(0),
    getExecOutput: vi.fn(),
    exec: vi.fn().mockResolvedValue(0),
    getRunCommand: vi.fn().mockReturnValue('mock-ssh-command'),
    getStatus: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ProviderFactory, 'getProvider').mockReturnValue(mockProvider as any);
    
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      workspace: { projectId: 'p', zone: 'z' }
    }));

    // Default: return mock for most calls
    mockProvider.getExecOutput.mockResolvedValue({ status: 0, stdout: 'mock-output', stderr: '' });
  });

  it('should fail if no PR number is provided', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await runOrchestrator([]);
    expect(res).toBe(1);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('should parse arguments correctly and run pre-flight if worktree missing', async () => {
    // Mock check for .git to FAIL (status 1) so it enters provisioning block
    mockProvider.getExecOutput.mockImplementation(async (cmd: string) => {
        if (cmd.includes('ls -d') && cmd.includes('.git')) {
            return { status: 1, stdout: '', stderr: 'not found' };
        }
        return { status: 0, stdout: 'mock-output', stderr: '' };
    });

    await runOrchestrator(['23176']);
    
    // Check for pre-flight commands
    // Note: Orchestrator calls docker exec manually for this one
    expect(mockProvider.exec).toHaveBeenCalledWith(
        expect.stringContaining('git worktree prune'),
        // No second arg because it's a raw sudo docker exec string
    );

    // Check if it provisioned inside container (this one uses the wrapper)
    expect(mockProvider.exec).toHaveBeenCalledWith(
        expect.stringContaining('rm -f /mnt/disks/data/gemini-cli-config/.gemini/history/workspace-23176-open*'),
        expect.objectContaining({ wrapContainer: 'maintainer-worker' })
    );
  });

  it('should NOT pass secrets via environment flags in docker exec', async () => {
    await runOrchestrator(['23176']);
    
    const lastCall = vi.mocked(mockProvider.getRunCommand).mock.calls[0][0];
    expect(lastCall).not.toContain('GEMINI_API_KEY=');
    expect(lastCall).not.toContain('GITHUB_TOKEN=');
    expect(lastCall).not.toContain('GH_TOKEN=');
  });

  it('should handle shell mode', async () => {
    await runOrchestrator(['shell', 'my-id']);
    
    expect(mockProvider.getRunCommand).toHaveBeenCalledWith(
        expect.stringContaining('gemini'),
        expect.objectContaining({ interactive: true })
    );
  });
});

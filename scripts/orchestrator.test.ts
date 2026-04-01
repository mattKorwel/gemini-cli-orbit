/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOrchestrator } from './orchestrator.js';
import { ProviderFactory } from './providers/ProviderFactory.js';
import * as ConfigManager from './ConfigManager.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');
vi.mock('./utils/MissionUtils.js', () => ({
  resolveMissionContext: vi.fn().mockReturnValue({
    branchName: 'feat-branch',
    containerName: 'gcli-23176-review',
    sessionName: 'orbit-feat-branch',
    worktreeName: 'mission-23176-review',
  }),
}));
vi.mock('./RemoteProvisioner.js', () => {
  return {
    RemoteProvisioner: vi.fn().mockImplementation(() => ({
      prepareMissionWorkspace: vi.fn().mockResolvedValue('/tmp/worktree'),
    })),
  };
});

describe('runOrchestrator', () => {
  const mockProvider = {
    ensureReady: vi.fn().mockResolvedValue(0),
    exec: vi.fn().mockResolvedValue(0),
    getRunCommand: vi.fn().mockImplementation((cmd) => cmd),
    type: 'gce',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider as any);
    vi.mocked(ConfigManager.detectRepoName).mockReturnValue('repo');
    vi.mocked(ConfigManager.getRepoConfig).mockReturnValue({
      projectId: 'p',
      zone: 'z',
      instanceName: 'i',
      repoName: 'repo',
      upstreamRepo: 'org/repo',
      remoteWorkDir: '/mnt/disks/data/main',
    });
    vi.mocked(ConfigManager.sanitizeName).mockImplementation((n) => n);

    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'which' && args?.[0] === 'tmux') {
        return { status: 0 } as any;
      }
      if (cmd === 'gh' && args?.[0] === 'auth' && args?.[1] === 'token') {
        return { status: 0, stdout: 'MOCK_TOKEN' } as any;
      }
      return { status: 0 } as any;
    });

    vi.mocked(fs.existsSync).mockReturnValue(false);
    mockProvider.exec.mockResolvedValue(0);
  });

  it('should return 0 on successful orchestration (Optimistic path)', async () => {
    // 1st call is optimistic attempt -> return 0
    mockProvider.exec.mockResolvedValueOnce(0);

    const res = await runOrchestrator(['23176', 'review']);
    expect(res).toBe(0);

    // Should NOT have called ensureReady because optimistic succeeded
    expect(mockProvider.ensureReady).not.toHaveBeenCalled();
  });

  it('should trigger slow-path if optimistic uplink fails with connectivity error 255', async () => {
    // 1st call: Optimistic attempt fails with 255
    mockProvider.exec.mockResolvedValueOnce(255);
    // ensureReady succeeded
    mockProvider.ensureReady.mockResolvedValue(0);
    // authRes injection succeeded
    mockProvider.exec.mockResolvedValueOnce(0);
    // Final launch succeeded
    mockProvider.exec.mockResolvedValueOnce(0);

    const res = await runOrchestrator(['23176', 'review']);
    expect(res).toBe(0);

    // SHOULD have called ensureReady
    expect(mockProvider.ensureReady).toHaveBeenCalled();
  });

  it('should inject GitHub token into RAM-disk context', async () => {
    vi.mocked(mockProvider.exec).mockReset();
    mockProvider.exec
      .mockResolvedValueOnce(255) // Fail optimistic
      .mockResolvedValueOnce(0) // authRes
      .mockResolvedValueOnce(0) // prepare
      .mockResolvedValueOnce(0); // launch

    await runOrchestrator(['23176', 'review'], {
      GEMINI_API_KEY: 'test-key',
    });

    const authCall = mockProvider.exec.mock.calls.find((call: any) =>
      call[0].includes('GITHUB_TOKEN=MOCK_TOKEN'),
    );
    expect(authCall).toBeDefined();
    expect(authCall[0]).toContain('chmod 600');
  });

  it('should fallback to raw execution if tmux is missing', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'gh' && args?.[0] === 'pr') {
        return { status: 0, stdout: Buffer.from('feat-branch') } as any;
      }
      if (cmd === 'which' && args?.[0] === 'tmux') {
        return { status: 1 } as any; // tmux missing
      }
      return { status: 0 } as any;
    });

    await runOrchestrator(['23176', 'review']);

    // Check all calls to getRunCommand
    const calls = vi.mocked(mockProvider.getRunCommand).mock.calls;
    const tmuxCall = calls.find((call) => call[0].includes('tmux new-session'));
    expect(tmuxCall).toBeUndefined();
  });

  it('should use raw execution if useTmux is disabled in config', async () => {
    vi.mocked(ConfigManager.getRepoConfig).mockReturnValue({
      projectId: 'p',
      zone: 'z',
      instanceName: 'i',
      repoName: 'repo',
      upstreamRepo: 'org/repo',
      remoteWorkDir: '/mnt/disks/data/main',
      useTmux: false,
    });

    await runOrchestrator(['23176', 'review']);

    const calls = vi.mocked(mockProvider.getRunCommand).mock.calls;
    const tmuxCall = calls.find((call) => call[0].includes('tmux new-session'));
    expect(tmuxCall).toBeUndefined();
  });
});

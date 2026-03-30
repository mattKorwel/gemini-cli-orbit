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
vi.mock('./RemoteProvisioner.js', () => {
  return {
    RemoteProvisioner: vi.fn().mockImplementation(() => ({
      provisionWorktree: vi.fn().mockResolvedValue('/tmp/worktree'),
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
      if (cmd === 'gh' && args?.[0] === 'pr') {
        return { status: 0, stdout: Buffer.from('feat-branch') } as any;
      }
      if (cmd === 'which' && args?.[0] === 'tmux') {
        return { status: 0 } as any;
      }
      return { status: 0 } as any;
    });

    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('should return 0 on successful orchestration', async () => {
    const res = await runOrchestrator(['23176', 'review']);
    expect(res).toBe(0);
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

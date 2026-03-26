/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteProvisioner } from './RemoteProvisioner.ts';

describe('RemoteProvisioner', () => {
  let mockProvider: any;
  let provisioner: RemoteProvisioner;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockProvider = {
        getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: '' }),
        exec: vi.fn().mockResolvedValue(0),
        getCapsuleStatus: vi.fn().mockResolvedValue({ running: true, exists: true }),
    };
    provisioner = new RemoteProvisioner(mockProvider);
  });

  it('should provision a new worktree successfully', async () => {
    // Sequence:
    // 1. getCapsuleStatus (in provisionWorktree start) -> returns running: true (via mockProvider default)
    // 2. getExecOutput (the .git check) -> returns status 1 (missing)
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 1, stdout: '' }); // .git check
    // 3. getExecOutput (the git clone / setup command) -> returns status 0 (success)
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 0, stdout: 'clone success' }); 

    const config = {
      remoteWorkDir: '/mnt/disks/data/main/gemini-cli',
      worktreesDir: '/mnt/disks/data/worktrees/gemini-cli',
      upstreamUrl: 'https://github.com/google-gemini/gemini-cli.git',
      instanceName: 'test-instance'
    };
    const path = await provisioner.provisionWorktree('23176', 'open', false, 'TOKEN', config);
    expect(path).toBe('/mnt/disks/data/worktrees/gemini-cli/mission-23176-open');
    
    // Verify the .git check was called
    expect(mockProvider.getExecOutput).toHaveBeenCalledWith(expect.stringContaining('.git'), expect.any(Object));
  });
});

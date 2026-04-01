/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteProvisioner } from './RemoteProvisioner.js';

vi.mock('./utils/MissionUtils.js', () => ({
  resolveMissionContext: () => ({
    branchName: 'feat-branch',
    containerName: 'gcli-23176-open',
    sessionName: 'orbit-feat-branch',
    worktreeName: 'mission-23176-open',
  }),
}));

describe('RemoteProvisioner', () => {
  let mockProvider: any;
  let provisioner: RemoteProvisioner;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockProvider = {
      getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: '' }),
      exec: vi.fn().mockResolvedValue(0),
      getCapsuleStatus: vi
        .fn()
        .mockResolvedValue({ running: true, exists: true }),
      runCapsule: vi.fn().mockResolvedValue(0),
      removeCapsule: vi.fn().mockResolvedValue(0),
    };
    provisioner = new RemoteProvisioner(mockProvider);
  });

  it('should provision a new worktree and mission capsule successfully', async () => {
    // 1. getCapsuleStatus -> returns running: false, exists: false
    mockProvider.getCapsuleStatus.mockResolvedValueOnce({
      running: false,
      exists: false,
    });
    // 2. runCapsule -> returns 0
    // 3. getExecOutput (the echo 1 stabilizer) -> returns status 0
    mockProvider.getExecOutput.mockResolvedValueOnce({
      status: 0,
      stdout: '1',
    });
    // 4. getExecOutput (the .git check) -> returns status 1 (missing)
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 1, stdout: '' });
    // 5. getExecOutput (the git clone / setup command) -> returns status 0 (success)
    mockProvider.getExecOutput.mockResolvedValueOnce({
      status: 0,
      stdout: 'clone success',
    });

    const config = {
      remoteWorkDir: '/mnt/disks/data/main/gemini-cli',
      worktreesDir: '/mnt/disks/data/worktrees/gemini-cli',
      upstreamUrl: 'https://github.com/google-gemini/gemini-cli.git',
      instanceName: 'test-instance',
      cpuLimit: '4',
      memoryLimit: '16g',
    };

    const path = await provisioner.prepareMissionWorkspace(
      '23176',
      'open',
      false,
      'TOKEN',
      config,
    );
    expect(path).toBe(
      '/mnt/disks/data/worktrees/gemini-cli/mission-23176-open',
    );

    // Verify runCapsule was called with correct limits
    expect(mockProvider.runCapsule).toHaveBeenCalledWith(
      expect.objectContaining({
        cpuLimit: '4',
        memoryLimit: '16g',
      }),
    );
  });

  it('should NEVER use remoteWorkDir as a fallback for the Docker image', async () => {
    mockProvider.getCapsuleStatus.mockResolvedValue({
      running: false,
      exists: false,
    });
    mockProvider.getExecOutput.mockResolvedValue({ status: 0, stdout: '1' });

    const config = {
      remoteWorkDir: '/mnt/disks/data/main/gemini-cli', // This path was causing the bug
      worktreesDir: '/mnt/disks/data/worktrees/gemini-cli',
      upstreamUrl: 'https://github.com/google-gemini/gemini-cli.git',
      image: undefined, // Force fallback
    };

    await provisioner.prepareMissionWorkspace(
      '23176',
      'open',
      false,
      '',
      config,
    );

    // The image should be the default (mock-image from Constants) OR undefined (allowing provider default)
    // but crucially it should NOT be the directory path.
    const runCall = mockProvider.runCapsule.mock.calls[0][0];
    expect(runCall.image).not.toBe(config.remoteWorkDir);
    expect(runCall.image).toBeDefined();
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteProvisioner } from './RemoteProvisioner.js';
import { SessionManager } from '../utils/SessionManager.js';

vi.mock('../utils/SessionManager.js');
vi.mock('../utils/MissionUtils.js', () => ({
  resolveMissionContext: vi.fn().mockReturnValue({
    branchName: 'feat-test',
    containerName: 'orbit-test-container',
    worktreeName: 'test-wt',
  }),
}));
vi.mock('./Logger.js');

describe('RemoteProvisioner', () => {
  const mockProvider = {
    type: 'gce',
    getStatus: vi.fn(),
    getCapsuleStatus: vi.fn(),
    runCapsule: vi.fn(),
  };

  const config = {
    repoName: 'test-repo',
    remoteWorkDir: '/mnt/disks/data/main',
    upstreamRepo: 'google/test-repo',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (SessionManager.generateSessionId as any).mockReturnValue('test-session');
  });

  it('should provision a new capsule if it does not exist', async () => {
    mockProvider.getCapsuleStatus.mockResolvedValue({ exists: false });
    mockProvider.runCapsule.mockResolvedValue(0);

    const provisioner = new RemoteProvisioner(mockProvider as any);
    await provisioner.prepareMissionWorkspace('123', 'chat', config);

    expect(mockProvider.runCapsule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'orbit-test-container',
      }),
    );
  });

  it('should skip provisioning if capsule already exists', async () => {
    mockProvider.getCapsuleStatus.mockResolvedValue({ exists: true });

    const provisioner = new RemoteProvisioner(mockProvider as any);
    await provisioner.prepareMissionWorkspace('123', 'chat', config);

    expect(mockProvider.runCapsule).not.toHaveBeenCalled();
  });
});

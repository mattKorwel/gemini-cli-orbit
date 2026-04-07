/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteProvisioner } from './RemoteProvisioner.js';
import { SessionManager } from '../utils/SessionManager.js';
import {
  type ProjectContext,
  type InfrastructureSpec,
} from '../core/Constants.js';

vi.mock('../utils/SessionManager.js');
vi.mock('../utils/MissionUtils.js', () => ({
  resolveMissionContext: vi.fn().mockReturnValue({
    branchName: 'feat-test',
    repoSlug: 'test-repo',
    idSlug: 'feat-test',
  }),
}));
vi.mock('../core/Logger.js');

describe('RemoteProvisioner', () => {
  const mockProvider = {
    type: 'gce',
    getCapsuleStatus: vi.fn(),
    runCapsule: vi.fn(),
    exec: vi.fn(),
    resolveSecretId: vi.fn().mockReturnValue('test-secret-id'),
    resolveSecretPath: vi.fn().mockReturnValue('/dev/shm/.orbit-env-test'),
  };

  const projectCtx: ProjectContext = {
    repoRoot: '/local/repo',
    repoName: 'test-repo',
  };

  const infra: InfrastructureSpec = {
    remoteWorkDir: '/mnt/disks/data/main',
    workspacesDir: '/mnt/disks/data/workspaces',
  };

  const mockCtx = {
    branchName: 'feat-test',
    repoSlug: 'test-repo',
    idSlug: 'feat-test',
    action: 'chat',
    containerName: 'test-repo-feat-test',
    workspaceName: 'test-repo-feat-test',
    sessionName: 'test-repo/feat-test',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (SessionManager.generateMissionId as any).mockReturnValue('test-session');
    (SessionManager.getSessionIdFromEnv as any).mockReturnValue(null);
    mockProvider.exec.mockResolvedValue(0);
  });

  it('should provision a new capsule if it does not exist', async () => {
    mockProvider.getCapsuleStatus.mockResolvedValue({ exists: false });
    mockProvider.runCapsule.mockResolvedValue(0);

    const provisioner = new RemoteProvisioner(projectCtx, mockProvider as any);
    await provisioner.prepareMissionWorkspace(mockCtx, infra);

    // Should touch the secret file even if no secrets
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.stringContaining('sudo touch /dev/shm/.orbit-env-'),
    );

    expect(mockProvider.runCapsule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'test-repo-feat-test',
      }),
    );
  });

  it('should inject sensitive secrets if provided', async () => {
    mockProvider.getCapsuleStatus.mockResolvedValue({ exists: false });
    mockProvider.runCapsule.mockResolvedValue(0);

    const infraWithSecrets: any = {
      ...infra,
      sensitiveEnv: { API_KEY: 'secret-123' },
    };

    const provisioner = new RemoteProvisioner(projectCtx, mockProvider as any);
    await provisioner.prepareMissionWorkspace(mockCtx, infraWithSecrets);

    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.stringContaining("API_KEY='\\''secret-123'\\'''"),
    );
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.stringContaining('chmod 600'),
    );
  });

  it('should skip provisioning if capsule already exists', async () => {
    mockProvider.getCapsuleStatus.mockResolvedValue({ exists: true });

    const provisioner = new RemoteProvisioner(projectCtx, mockProvider as any);
    await provisioner.prepareMissionWorkspace(mockCtx, infra);

    expect(mockProvider.runCapsule).not.toHaveBeenCalled();
  });
});

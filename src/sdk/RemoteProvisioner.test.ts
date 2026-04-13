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
vi.mock('node:fs', () => ({
  default: {
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
  },
}));

describe('RemoteProvisioner', () => {
  const mockProvider = {
    type: 'gce',
    getCapsuleStatus: vi.fn(),
    runCapsule: vi.fn(),
    exec: vi.fn(),
    sync: vi.fn().mockResolvedValue(0),
    resolveSecretId: vi.fn().mockReturnValue('test-secret-id'),
    resolveSecretPath: vi.fn().mockReturnValue('/dev/shm/.orbit-env-test'),
    resolvePolicyPath: vi.fn().mockReturnValue('/mock/policy.toml'),
    resolveMirrorPath: vi.fn().mockReturnValue('/mock/mirror'),
    resolveBundlePath: vi.fn().mockReturnValue('/mock/bundle'),
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

    // 1. Should sync manifest
    expect(mockProvider.sync).toHaveBeenCalledWith(
      expect.stringContaining('.orbit-manifest'),
      expect.stringContaining('/dev/shm/'),
      expect.anything(),
    );

    // 2. Should touch the secret file even if no secrets
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.stringContaining('sudo touch /dev/shm/.orbit-env-'),
    );

    // 3. Should run capsule with manifest mount
    expect(mockProvider.runCapsule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'test-repo-feat-test',
        mounts: expect.arrayContaining([
          expect.objectContaining({
            capsule: '/orbit/manifest.json',
          }),
        ]),
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

  it('should skip provisioning if capsule already exists but still sync manifest', async () => {
    mockProvider.getCapsuleStatus.mockResolvedValue({ exists: true });

    const provisioner = new RemoteProvisioner(projectCtx, mockProvider as any);
    await provisioner.prepareMissionWorkspace(mockCtx, infra);

    expect(mockProvider.sync).toHaveBeenCalled();
    expect(mockProvider.runCapsule).not.toHaveBeenCalled();
  });
});

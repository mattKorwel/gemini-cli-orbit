/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type OrbitProvider } from '../providers/BaseProvider.js';
import { SessionManager } from '../utils/SessionManager.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';
import {
  ORBIT_ROOT,
  type InfrastructureSpec,
  type ProjectContext,
} from '../core/Constants.js';
import { logger } from '../core/Logger.js';

/**
 * Handles remote-specific mission provisioning (Docker Capsules).
 */
export class RemoteProvisioner {
  constructor(
    private readonly projectCtx: ProjectContext,
    private readonly provider: OrbitProvider,
  ) {}

  /**
   * Orchestrates the high-level provisioning of a remote mission.
   * Handles:
   * 1. Secret/Token RAM-disk generation (ADR 14).
   * 2. Docker container (Capsule) setup.
   * 3. Worktree isolation and remote mount configuration.
   */
  public async prepareMissionWorkspace(
    identifier: string,
    action: string,
    infra: InfrastructureSpec,
  ): Promise<void> {
    if (this.provider.type !== 'gce') {
      throw new Error(
        `RemoteProvisioner does not support provider type: ${this.provider.type}`,
      );
    }

    const mCtx = resolveMissionContext(identifier, action);
    const branch = mCtx.branchName;
    const containerName = mCtx.containerName;
    const remoteWorktreeDir = `${ORBIT_ROOT}/worktrees/${this.projectCtx.repoName}/${mCtx.worktreeName}`;

    // RAM-disk secret mount (ADR 14)
    const secretPath = `/dev/shm/.orbit-env-${SessionManager.generateMissionId(
      identifier,
      action,
    )}`;
    const imageUri =
      infra.imageUri ||
      'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';

    // 1. Ensure the capsule exists
    const capsuleStatus = await this.provider.getCapsuleStatus(containerName);

    if (!capsuleStatus.exists) {
      logger.info(`   - Provisioning isolated workspace for '${branch}'...`);

      const runRes = await this.provider.runCapsule({
        name: containerName,
        image: infra.imageUri || imageUri,
        user: 'root',
        cpuLimit: infra.cpuLimit || '2',
        memoryLimit: infra.memoryLimit || '8g',
        sensitiveEnv: (infra as any).sensitiveEnv || {},
        mounts: [
          {
            host: infra.remoteWorkDir!,
            capsule: infra.remoteWorkDir!,
            readonly: false,
          },
          {
            host: remoteWorktreeDir,
            capsule: remoteWorktreeDir,
            readonly: false,
          },
          { host: ORBIT_ROOT, capsule: ORBIT_ROOT, readonly: false },
          {
            host: `${ORBIT_ROOT}/gemini-cli-config/.gemini`,
            capsule: '/home/node/.gemini',
            readonly: false,
          },
          // RAM-disk secret mount (ADR 14)
          {
            host: secretPath,
            capsule: `${remoteWorktreeDir}/.env`,
            readonly: true,
          },
        ],
        command: `/bin/bash -c "ln -sfn ${ORBIT_ROOT} /home/node/.orbit && while true; do sleep 1000; done"`,
      });

      if (runRes !== 0) {
        throw new Error(
          `Failed to provision workspace: provider returned ${runRes}`,
        );
      }
    }

    logger.info(`   ✅ Workspace provisioned: ${containerName}`);
  }
}

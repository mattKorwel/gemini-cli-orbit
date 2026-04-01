/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { type OrbitProvider } from '../providers/BaseProvider.js';
import { SessionManager } from '../utils/SessionManager.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';
import { ORBIT_ROOT } from './Constants.js';
import { logger } from './Logger.js';

/**
 * Handles remote-specific mission provisioning (Docker Capsules).
 */
export class RemoteProvisioner {
  constructor(private provider: OrbitProvider) {}

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
    config: any,
  ): Promise<void> {
    if (this.provider.type !== 'gce') {
      throw new Error(
        `RemoteProvisioner does not support provider type: ${this.provider.type}`,
      );
    }

    const mCtx = resolveMissionContext(identifier, action);
    const branch = mCtx.branchName;
    const containerName = mCtx.containerName;
    const remoteWorktreeDir = `${ORBIT_ROOT}/worktrees/${config.repoName}/${mCtx.worktreeName}`;

    // RAM-disk secret mount (ADR 14)
    const secretPath = `/dev/shm/.gcli-env-${SessionManager.generateSessionId(
      identifier,
      action,
    )}`;
    const imageUri =
      config.image ||
      'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';

    // 1. Ensure the capsule exists
    const capsuleStatus = await this.provider.getCapsuleStatus(containerName);

    if (!capsuleStatus.exists) {
      logger.info(`   - Provisioning isolated workspace for '${branch}'...`);

      const runRes = await this.provider.runCapsule({
        name: containerName,
        image: config.image || imageUri,
        user: 'root',
        cpuLimit: config.cpuLimit || '2',
        memoryLimit: config.memoryLimit || '8g',
        sensitiveEnv: config.sensitiveEnv || {},
        mounts: [
          {
            host: config.remoteWorkDir,
            capsule: config.remoteWorkDir,
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

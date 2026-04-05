/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type OrbitProvider } from '../providers/BaseProvider.js';
import { SessionManager } from '../utils/SessionManager.js';
import { type MissionContext } from '../utils/MissionUtils.js';
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
    mCtx: MissionContext,
    infra: InfrastructureSpec,
  ): Promise<void> {
    if (this.provider.type !== 'gce') {
      throw new Error(
        `RemoteProvisioner does not support provider type: ${this.provider.type}`,
      );
    }

    const { branchName: branch, containerName, workspaceName } = mCtx;

    const remoteWorkspaceDir = `${ORBIT_ROOT}/workspaces/${this.projectCtx.repoName}/${workspaceName}`;

    // RAM-disk secret mount (ADR 14)
    // For generating the ID, we still use PR ID but we'll stick to mCtx
    const missionId = SessionManager.getSessionIdFromEnv() || containerName;

    const secretPath = `/dev/shm/.orbit-env-${missionId}`;
    const imageUri =
      infra.imageUri ||
      'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';

    // 1. Ensure the capsule exists
    const capsuleStatus = await this.provider.getCapsuleStatus(containerName);

    if (!capsuleStatus.exists) {
      logger.info(`   - Provisioning isolated workspace for '${branch}'...`);

      // ADR 14: Populate RAM-disk secret file before launching capsule
      const sensitiveEnv = (infra as any).sensitiveEnv || {};
      const secretEntries = Object.entries(sensitiveEnv);
      if (secretEntries.length > 0) {
        logger.info('   - Injecting mission credentials into RAM-disk...');
        const envContent = secretEntries
          .map(([k, v]) => `${k}='${(v as string).replace(/'/g, "'\\''")}'`)
          .join('\n');

        // Use printf to handle multi-line content and redirect to secretPath
        const writeSecretCmd = `printf "%s\n" '${envContent.replace(/'/g, "'\\''")}' | sudo tee ${secretPath} > /dev/null && sudo chmod 600 ${secretPath}`;
        await this.provider.exec(writeSecretCmd);
      } else {
        // Ensure secretPath exists even if empty to satisfy Docker mount
        await this.provider.exec(
          `sudo touch ${secretPath} && sudo chmod 600 ${secretPath}`,
        );
      }

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
            host: remoteWorkspaceDir,
            capsule: remoteWorkspaceDir,
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
            capsule: `${remoteWorkspaceDir}/.env`,
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

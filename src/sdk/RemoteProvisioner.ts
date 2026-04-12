/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { type OrbitProvider } from '../providers/BaseProvider.js';
import { type MissionContext } from '../utils/MissionUtils.js';
import {
  ORBIT_ROOT,
  CAPSULE_MANIFEST_PATH,
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
   * 2. Manifest-on-Disk generation and sync.
   * 3. Docker container (Capsule) setup with volume mounts.
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

    const {
      branchName: branch,
      containerName,
      workspaceName,
      repoSlug,
      idSlug,
      action,
    } = mCtx;

    const remoteWorkspaceDir = path.join(infra.workspacesDir!, workspaceName);

    // RAM-disk paths (ADR 14 + Manifest-on-Disk)
    const secretId = this.provider.resolveSecretId(repoSlug, idSlug, action);
    const secretPath = this.provider.resolveSecretPath(secretId);
    const remoteManifestPath = `/dev/shm/.orbit-manifest-${containerName}.json`;

    // 1. Sync Manifest to Remote RAM-disk
    const manifestJson = JSON.stringify({
      identifier: mCtx.idSlug,
      repoName: this.projectCtx.repoName,
      branchName: mCtx.branchName,
      action: mCtx.action,
      workDir: remoteWorkspaceDir,
      containerName,
      sessionName: mCtx.sessionName,
      policyPath: this.provider.resolvePolicyPath(),
      upstreamUrl: mCtx.upstreamUrl || (infra as any).upstreamUrl,
      tempDir: remoteWorkspaceDir,
    });

    const localTempManifest = path.join(
      os.tmpdir(),
      `.orbit-manifest-${containerName}.json`,
    );
    fs.writeFileSync(localTempManifest, manifestJson);
    await this.provider.sync(localTempManifest, remoteManifestPath, {
      sudo: true,
      quiet: true,
    });
    fs.unlinkSync(localTempManifest);

    const imageUri =
      infra.imageUri ||
      'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';

    // 2. Ensure the capsule exists
    const capsuleStatus = await this.provider.getCapsuleStatus(containerName);

    if (!capsuleStatus.exists) {
      logger.info(`   - Provisioning isolated workspace for '${branch}'...`);

      // Ensure specific mission directory exists and is private to the container user (1000)
      // ADR 0018: Strict chmod 700 isolation ensures no cross-mission data access.
      const setupRes = await this.provider.exec(
        `sudo mkdir -p ${remoteWorkspaceDir} && sudo chown -R 1000:1000 ${remoteWorkspaceDir} && sudo chmod 700 ${remoteWorkspaceDir}`,
        {
          quiet: true,
        },
      );

      if (setupRes !== 0) {
        throw new Error(
          `Failed to initialize mission workspace at ${remoteWorkspaceDir} (exit ${setupRes})`,
        );
      }

      // ADR 14: Populate RAM-disk secret file before launching capsule
      const sensitiveEnv = (infra as any).sensitiveEnv || {};
      const secretEntries = Object.entries(sensitiveEnv);
      if (secretEntries.length > 0) {
        logger.info('   - Injecting mission credentials into RAM-disk...');
        const envContent = secretEntries
          .map(([k, v]) => `${k}='${(v as string).replace(/'/g, "'\\''")}'`)
          .join('\n');

        const writeSecretCmd = `printf "%s\n" '${envContent.replace(/'/g, "'\\''")}' | sudo tee ${secretPath} > /dev/null && sudo chmod 600 ${secretPath}`;
        await this.provider.exec(writeSecretCmd);
      } else {
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
            readonly: true,
          },
          {
            host: remoteWorkspaceDir,
            capsule: remoteWorkspaceDir,
            readonly: false,
          },
          {
            host: `${ORBIT_ROOT}/bundle`,
            capsule: `${ORBIT_ROOT}/bundle`,
            readonly: true,
          },
          {
            host: `${ORBIT_ROOT}/gemini-cli-config/.gemini`,
            capsule: '/home/node/.gemini',
            readonly: false,
          },
          {
            host: `${ORBIT_ROOT}/gemini-cli-config/.config/gh`,
            capsule: '/home/node/.config/gh',
            readonly: false,
          },
          // RAM-disk secret mount (ADR 14)
          {
            host: secretPath,
            capsule: `${remoteWorkspaceDir}/.env`,
            readonly: true,
          },
          // Manifest-on-Disk mount
          {
            host: remoteManifestPath,
            capsule: CAPSULE_MANIFEST_PATH,
            readonly: true,
          },
        ],
        command: `ln -sfn ${ORBIT_ROOT} /home/node/.orbit && while true; do sleep 1000; done`,
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

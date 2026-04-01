/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { logger } from './Logger.js';
import { type OrbitProvider } from './providers/BaseProvider.js';
import { SessionManager } from './utils/SessionManager.js';
import { resolveMissionContext } from './utils/MissionUtils.js';
import { ORBIT_ROOT, DEFAULT_IMAGE_URI } from './Constants.js';

export class RemoteProvisioner {
  constructor(private provider: OrbitProvider) {}

  async prepareMissionWorkspace(
    identifier: string,
    action: string,
    isEvaMode: boolean,
    ghEnv: string,
    config: {
      remoteWorkDir: string;
      worktreesDir: string;
      upstreamUrl: string;
      cpuLimit?: string;
      memoryLimit?: string;
      image?: string;
      sensitiveEnv?: Record<string, string>;
    },
  ): Promise<string> {
    const isLocalWorktree = this.provider.type === 'local-worktree';
    const isGce = this.provider.type === 'gce';
    const mCtx = resolveMissionContext(identifier, action);
    const branch = mCtx.branchName;

    const containerName = isLocalWorktree ? branch : mCtx.containerName;
    const imageUri = DEFAULT_IMAGE_URI;

    const remoteWorktreeDir = isLocalWorktree
      ? path.join((this.provider as any).worktreesDir, branch)
      : `${config.worktreesDir}/${mCtx.worktreeName}`;

    const missionId = SessionManager.generateMissionId(identifier, action);
    const secretPath = `/dev/shm/.gcli-env-${missionId}`;

    // 1. Ensure the specific mission capsule is active
    const capsuleStatus = await this.provider.getCapsuleStatus(containerName);

    if (!capsuleStatus.exists) {
      logger.info(`   - Provisioning isolated workspace for '${branch}'...`);

      const runRes = await this.provider.runCapsule({
        name: containerName,
        image: config.image || imageUri,
        user: isGce ? 'root' : undefined,
        cpuLimit: config.cpuLimit || '2',
        memoryLimit: config.memoryLimit || '8g',
        sensitiveEnv: config.sensitiveEnv,
        mounts: isLocalWorktree
          ? []
          : [
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
        command: isLocalWorktree
          ? undefined
          : `/bin/bash -c "ln -sfn ${ORBIT_ROOT} /home/node/.orbit && while true; do sleep 1000; done"`,
      });

      if (runRes !== 0) {
        throw new Error(
          `Failed to provision workspace: provider returned ${runRes}`,
        );
      }
    }

    if (isLocalWorktree) {
      const wtPath = path.join((this.provider as any).worktreesDir, branch);
      logger.info(`   ✅ Local workspace ready: ${wtPath}`);
      return wtPath;
    }

    // --- REMOTE ONLY LOGIC ---
    await this.waitForCapsule(containerName, 10000);

    // 3. Provision the repository using a reference clone for speed and isolation
    const check = await this.provider.getExecOutput(
      `ls -d ${remoteWorktreeDir}/.git`,
      { wrapCapsule: containerName, quiet: true },
    );

    if (check.status !== 0) {
      logger.info(
        `   - Provisioning isolated git repo for ${identifier} (remote reference)...`,
      );

      await this.provider.exec(
        `sudo mkdir -p ${config.worktreesDir} && sudo chown -R 1000:1000 ${config.worktreesDir}`,
      );
      // Ensure target directory is clean before clone
      await this.provider.exec(`sudo rm -rf ${remoteWorktreeDir}`);
      await this.provider.exec(
        `sudo mkdir -p ${remoteWorktreeDir} && sudo chown -R 1000:1000 ${remoteWorktreeDir}`,
      );

      const cloneCmd = `
        (unset GITHUB_TOKEN GH_TOKEN && gh auth status >/dev/null 2>&1) || (unset GITHUB_TOKEN GH_TOKEN && test -f ${secretPath} && export GITHUB_TOKEN=$(cat ${secretPath} | grep GITHUB_TOKEN | cut -d= -f2-) && gh auth login --with-token) && \
        export GITHUB_TOKEN=$(cat ${secretPath} | grep GITHUB_TOKEN | cut -d= -f2-) && \
        git config --global --add safe.directory '*' && \
        git config --global url."https://x-access-token:\${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/" && \
        git clone --reference ${config.remoteWorkDir} --quiet -c core.filemode=false ${config.upstreamUrl} ${remoteWorktreeDir} && \
        cd ${remoteWorktreeDir} && \
        git config --replace-all core.filemode false && \
        git remote add upstream ${config.upstreamUrl} && \
        (gh pr checkout ${identifier} || git checkout ${identifier})
      `;

      const setupRes = await this.provider.getExecOutput(
        cloneCmd.replace(/\n/g, ''),
        { wrapCapsule: containerName, quiet: true },
      );
      if (setupRes.status !== 0) {
        throw new Error(
          `Failed to provision remote repo (Exit ${setupRes.status}): ${setupRes.stderr || 'No stderr captured'}`,
        );
      }
    }

    return remoteWorktreeDir;
  }

  async waitForCapsule(name: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    process.stdout.write(`   - Establishing capsule uplink (${name})...`);

    while (Date.now() - start < timeoutMs) {
      const res = await this.provider.getExecOutput('echo 1', {
        wrapCapsule: name,
        quiet: true,
      });
      if (res.status === 0) {
        process.stdout.write(' ✅ Link Active.\n');
        return;
      }
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, 500));
    }

    process.stdout.write(' ❌ Timeout.\n');
    throw new Error(
      `Capsule ${name} failed to stabilize within ${timeoutMs}ms`,
    );
  }
}

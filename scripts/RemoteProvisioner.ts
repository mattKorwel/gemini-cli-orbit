/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { logger } from './Logger.js';
import { type OrbitProvider } from './providers/BaseProvider.js';
import {
  ORBIT_ROOT,
  DEFAULT_IMAGE_URI,
  getPrimaryRepoRoot,
} from './Constants.js';
import { sanitizeName } from './ConfigManager.js';

export class RemoteProvisioner {
  constructor(private provider: OrbitProvider) {}

  /**
   * Resolves a PR number or branch name to a clean branch identifier.
   */
  private async resolveBranch(id: string): Promise<string> {
    if (/^\d+$/.test(id)) {
      const res = spawnSync(
        'gh',
        ['pr', 'view', id, '--json', 'headRefName', '-q', '.headRefName'],
        { stdio: 'pipe' },
      );
      if (res.status === 0) {
        return res.stdout.toString().trim();
      }
    }
    return id;
  }

  async provisionWorktree(
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
    },
  ): Promise<string> {
    const isLocalWorktree = this.provider.type === 'local-worktree';
    const isGce = this.provider.type === 'gce';
    const branch = await this.resolveBranch(identifier);

    const containerName = isLocalWorktree
      ? branch
      : `gcli-${sanitizeName(identifier)}-${action}`;
    const imageUri = DEFAULT_IMAGE_URI;

    // 1. Ensure the specific mission capsule is active
    const capsuleStatus = await this.provider.getCapsuleStatus(containerName);

    if (!capsuleStatus.exists) {
      logger.info(`   - Provisioning isolated workspace for '${branch}'...`);

      const remoteWorktreeDir = isLocalWorktree
        ? path.join((this.provider as any).worktreesDir, branch)
        : `${config.worktreesDir}/mission-${sanitizeName(identifier)}-${action}`;

      const runRes = await this.provider.runCapsule({
        name: containerName,
        image: config.image || config.remoteWorkDir || imageUri,
        user: isGce ? 'root' : undefined,
        cpuLimit: config.cpuLimit || '2',
        memoryLimit: config.memoryLimit || '8g',
        mounts: isLocalWorktree
          ? []
          : [
              {
                host: config.remoteWorkDir,
                capsule: config.remoteWorkDir,
                readonly: true,
              },
              {
                host: remoteWorktreeDir,
                capsule: remoteWorktreeDir,
                readonly: false,
              },
              { host: ORBIT_ROOT, capsule: ORBIT_ROOT, readonly: true },
              {
                host: `${ORBIT_ROOT}/gemini-cli-config/.gemini`,
                capsule: '/home/node/.gemini',
                readonly: false,
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
    const remoteWorktreeDir = `${config.worktreesDir}/mission-${sanitizeName(identifier)}-${action}`;
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
      await this.provider.exec(
        `sudo mkdir -p ${remoteWorktreeDir} && sudo chown -R 1000:1000 ${remoteWorktreeDir}`,
      );

      const cloneCmd = `
        (unset GITHUB_TOKEN GH_TOKEN && gh auth status >/dev/null 2>&1) || (unset GITHUB_TOKEN GH_TOKEN && cat ${ORBIT_ROOT}/.gh_token | gh auth login --with-token) && \
        git config --global --add safe.directory '*' && \
        git clone --reference ${config.remoteWorkDir} --quiet -c core.filemode=false ${config.upstreamUrl} ${remoteWorktreeDir} && \
        cd ${remoteWorktreeDir} && \
        git config --replace-all core.filemode false && \
        git remote add upstream ${config.upstreamUrl} && \
        (gh pr checkout ${identifier} || git checkout ${identifier})
      `;

      const setupRes = await this.provider.getExecOutput(
        cloneCmd.replace(/\n/g, ''),
        { wrapCapsule: containerName },
      );
      if (setupRes.status !== 0) {
        throw new Error(`Failed to provision remote repo: ${setupRes.stderr}`);
      }
    }

    return remoteWorktreeDir;
  }

  async waitForCapsule(name: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    process.stdout.write(`   - Waiting for capsule ${name} to stabilize...`);

    while (Date.now() - start < timeoutMs) {
      const res = await this.provider.getExecOutput('echo 1', {
        wrapCapsule: name,
        quiet: true,
      });
      if (res.status === 0) {
        process.stdout.write(' ✅ Ready.\n');
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

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkerProvider } from './providers/BaseProvider.ts';
import { 
  MAIN_REPO_PATH, 
  WORKTREES_PATH, 
  UPSTREAM_REPO_URL,
  CONFIG_DIR,
  WORKSPACES_ROOT
} from './Constants.ts';

function q(str: string) {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export class RemoteProvisioner {
  constructor(private provider: WorkerProvider) {}

  async provisionWorktree(prNumber: string, action: string, isShellMode: boolean, ghEnv: string): Promise<string> {
    const remoteWorktreeDir = `${WORKTREES_PATH}/workspace-${prNumber}-${action}`;
    const containerName = `gcli-${prNumber}-${action}`;
    const imageUri = 'us-docker.pkg.dev/gemini-code-dev/gemini-cli/maintainer:latest';

    // 1. Ensure the specific job container is running
    const containerStatus = await this.provider.getContainerStatus(containerName);

    if (!containerStatus.running) {
      console.log(`   - Provisioning isolated container ${containerName}...`);
      if (containerStatus.exists) {
        await this.provider.removeContainer(containerName);
      }

      await this.provider.runContainer({
        name: containerName,
        image: imageUri,
        user: 'root',
        cpuLimit: '2',
        memoryLimit: '8g',
        mounts: [
          { host: MAIN_REPO_PATH, container: MAIN_REPO_PATH, readonly: true }, // MOUNT READ-ONLY
          { host: remoteWorktreeDir, container: remoteWorktreeDir, readonly: false },
          { host: WORKSPACES_ROOT, container: WORKSPACES_ROOT, readonly: true },
          { host: `${WORKSPACES_ROOT}/gemini-cli-config/.gemini`, container: '/home/node/.gemini', readonly: false }
        ],
        command: `/bin/bash -c "ln -sfn ${WORKSPACES_ROOT} /home/node/.workspaces && while true; do sleep 1000; done"`
      });

      // Wait for container to stabilize
      await new Promise(r => setTimeout(r, 5000));
    }

    // 2. Clear previous history for this session
    const clearHistoryCmd = `rm -rf /home/node/.gemini/history/workspace-${prNumber}-${action}*`;
    await this.provider.exec(clearHistoryCmd, { wrapContainer: containerName });

    // 3. Provision the repository using a reference clone for speed and isolation
    const check = await this.provider.getExecOutput(`ls -d ${remoteWorktreeDir}/.git`, { wrapContainer: containerName, quiet: true });

    if (check.status !== 0) {
      console.log(`   - Provisioning isolated git repo for ${prNumber} (inside container via reference)...`);

      // 3.1 Ensure WORKTREES_PATH is owned by node on the HOST first
      await this.provider.exec(`sudo mkdir -p ${remoteWorktreeDir} && sudo chown -R 1000:1000 ${remoteWorktreeDir}`);

      // 3.2 Perform Reference Clone inside the container
      // We point to the RO main repo as the reference
      const cloneCmd = `
        (unset GITHUB_TOKEN GH_TOKEN && gh auth status >/dev/null 2>&1) || (unset GITHUB_TOKEN GH_TOKEN && cat ${WORKSPACES_ROOT}/.gh_token | gh auth login --with-token) && \
        git config --global --add safe.directory '*' && \
        (rm -rf ${remoteWorktreeDir} || true) && \
        git clone --reference ${MAIN_REPO_PATH} --quiet -c core.filemode=false ${UPSTREAM_REPO_URL} ${remoteWorktreeDir} && \
        cd ${remoteWorktreeDir} && \
        git config --replace-all core.filemode false && \
        git remote add upstream ${UPSTREAM_REPO_URL} && \
        gh pr checkout ${prNumber}
      `;

      const setupRes = await this.provider.getExecOutput(cloneCmd.replace(/\n/g, ''), { wrapContainer: containerName });
      if (setupRes.status !== 0) {
        throw new Error(`Failed to provision isolated repo: ${setupRes.stderr}`);
      }
      console.log('   ✅ Isolated repository provisioned successfully.');
    } else {
      console.log('   ✅ Remote repository ready.');
    }

    await this.provider.exec(`chown -R 1000:1000 ${remoteWorktreeDir}`, { wrapContainer: containerName });
    return remoteWorktreeDir;
  }}

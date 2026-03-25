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
          { host: MAIN_REPO_PATH, container: MAIN_REPO_PATH, readonly: true },
          { host: remoteWorktreeDir, container: remoteWorktreeDir },
          { host: WORKSPACES_ROOT, container: WORKSPACES_ROOT, readonly: true },
          { host: `${WORKSPACES_ROOT}/gemini-cli-config/.gemini`, container: '/home/node/.gemini' }
        ],
        command: `/bin/bash -c "chown -R node:node /home/node/.config && ln -sfn ${WORKSPACES_ROOT} /home/node/.workspaces && while true; do sleep 1000; done"`
      });
    }

    // 2. Clear previous history for this session
    const clearHistoryCmd = `rm -rf /home/node/.gemini/history/workspace-${prNumber}-${action}*`;
    await this.provider.exec(clearHistoryCmd, { wrapContainer: containerName });

    // 3. Provision the worktree
    const check = await this.provider.getExecOutput(`ls -d ${remoteWorktreeDir}/.git`, { wrapContainer: containerName, quiet: true });

    if (check.status !== 0) {
      console.log(`   - Provisioning isolated git worktree for ${prNumber} (inside container)...`);

      const gitFetch = isShellMode
        ? `git -c safe.directory='*' -C ${MAIN_REPO_PATH} fetch --quiet origin`
        : `git -c safe.directory='*' -C ${MAIN_REPO_PATH} fetch --quiet upstream pull/${prNumber}/head`;

      const gitTarget = 'FETCH_HEAD';

      // Ensure the worktrees parent directory is owned by node
      await this.provider.exec(`sudo mkdir -p ${WORKTREES_PATH} && sudo chown -R 1000:1000 ${WORKTREES_PATH}`);

      // PRE-FLIGHT: Prune stale worktree metadata and clean the main repo
      const preflightCmd = `
        export HOME=/home/node && \
        git config --global --add safe.directory '*' && \
        cd ${MAIN_REPO_PATH} && \
        git worktree prune && \
        git clean -ffdx
      `;
      await this.provider.exec(preflightCmd, { wrapContainer: containerName });

      // If the directory exists but .git is missing, it's broken. Wipe it.
      const setupCmd = `
        export HOME=/home/node && \
        (git -c safe.directory='*' -C ${MAIN_REPO_PATH} worktree remove -f ${remoteWorktreeDir} || rm -rf ${remoteWorktreeDir}) 2>/dev/null && \
        ${gitFetch} && \
        git -C ${MAIN_REPO_PATH} -c safe.directory='*' worktree add --quiet -f ${remoteWorktreeDir} ${gitTarget} && \
        git -C ${remoteWorktreeDir} repair
      `;
      const setupRes = await this.provider.getExecOutput(setupCmd, { wrapContainer: containerName });
      if (setupRes.status !== 0) {
        throw new Error(`Failed to provision remote worktree: ${setupRes.stderr}`);
      }
      console.log('   ✅ Worktree provisioned successfully.');
    } else {
      console.log('   ✅ Remote worktree ready.');
    }

    await this.provider.exec(`chown -R 1000:1000 ${remoteWorktreeDir}`, { wrapContainer: containerName });
    return remoteWorktreeDir;
  }
}

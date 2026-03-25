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
  CONFIG_DIR
} from './Constants.ts';

function q(str: string) {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export class RemoteProvisioner {
  constructor(private provider: WorkerProvider) {}

  async provisionWorktree(prNumber: string, action: string, isShellMode: boolean, ghEnv: string): Promise<string> {
    const remoteWorktreeDir = `${WORKTREES_PATH}/workspace-${prNumber}-${action}`;

    // Clear previous history for this session if it exists to ensure a fresh start
    const clearHistoryCmd = `rm -rf ${CONFIG_DIR}/history/workspace-${prNumber}-${action}*`;
    await this.provider.exec(clearHistoryCmd, { wrapContainer: 'maintainer-worker' });

    // Use the container-safe path for check
    const check = await this.provider.getExecOutput(`ls -d ${remoteWorktreeDir}/.git`, { wrapContainer: 'maintainer-worker', quiet: true });

    if (check.status !== 0) {
      console.log(`   - Provisioning isolated git worktree for ${prNumber} (inside container)...`);

      // Ensure the main repo exists inside the container
      const repoCheck = await this.provider.getExecOutput(`ls -d ${MAIN_REPO_PATH}/.git`, { wrapContainer: 'maintainer-worker', quiet: true });
      if (repoCheck.status !== 0) {
          console.log(`   - Initializing main repository inside container...`);
          const initRepoCmd = `
            rm -rf ${MAIN_REPO_PATH} && \
            git clone --quiet --filter=blob:none ${UPSTREAM_REPO_URL} ${MAIN_REPO_PATH} && \
            cd ${MAIN_REPO_PATH} && \
            git remote add upstream ${UPSTREAM_REPO_URL} && \
            git fetch --quiet upstream
          `;
          const initRes = await this.provider.getExecOutput(`sudo docker exec -u node ${ghEnv}maintainer-worker sh -c ${q(initRepoCmd)}`);
          if (initRes.status !== 0) {
              throw new Error(`Failed to initialize main repository: ${initRes.stderr}`);
          }
      }

      const gitFetch = isShellMode
        ? `git -c safe.directory='*' -C ${MAIN_REPO_PATH} fetch --quiet origin`
        : `git -c safe.directory='*' -C ${MAIN_REPO_PATH} fetch --quiet upstream pull/${prNumber}/head`;

      const gitTarget = 'FETCH_HEAD';

      // Ensure the worktrees parent directory is owned by node
      await this.provider.exec(`sudo mkdir -p ${WORKTREES_PATH} && sudo chown -R 1000:1000 ${WORKTREES_PATH}`);

      // PRE-FLIGHT: Prune stale worktree metadata and clean the main repo
      const preflightCmd = `
        export HOME=${CONFIG_DIR}/.. && \
        git config --global --add safe.directory '*' && \
        cd ${MAIN_REPO_PATH} && \
        git worktree prune && \
        git clean -ffdx
      `;      await this.provider.exec(`sudo docker exec -u node maintainer-worker sh -c ${q(preflightCmd)}`);

      // If the directory exists but .git is missing, it's broken. Wipe it.
      const setupCmd = `
        export HOME=${CONFIG_DIR}/.. && \
        mkdir -p ${WORKTREES_PATH} && \
        (git -c safe.directory='*' -C ${MAIN_REPO_PATH} worktree remove -f ${remoteWorktreeDir} || rm -rf ${remoteWorktreeDir}) 2>/dev/null && \
        ${gitFetch} && \
        git -c safe.directory='*' -C ${MAIN_REPO_PATH} worktree add --quiet -f ${remoteWorktreeDir} ${gitTarget}
      `;
      const setupRes = await this.provider.getExecOutput(`sudo docker exec -u node ${ghEnv}maintainer-worker sh -c ${q(setupCmd)}`);
      if (setupRes.status !== 0) {
        throw new Error(`Failed to provision remote worktree: ${setupRes.stderr}`);
      }
      console.log('   ✅ Worktree provisioned successfully.');
    } else {
      console.log('   ✅ Remote worktree ready.');
    }

    await this.provider.exec(`sudo chown -R 1000:1000 ${remoteWorktreeDir}`);
    return remoteWorktreeDir;
  }
}

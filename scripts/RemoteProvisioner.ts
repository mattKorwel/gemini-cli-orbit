/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  type OrbitProvider,
} from './providers/BaseProvider.js';
import { 
  ORBIT_ROOT,
  DEFAULT_IMAGE_URI
} from './Constants.js';

export class RemoteProvisioner {
  constructor(private provider: OrbitProvider) {}

  async provisionWorktree(prNumber: string, action: string, isEvaMode: boolean, ghEnv: string, config: { remoteWorkDir: string, worktreesDir: string, upstreamUrl: string }): Promise<string> {
    const remoteWorktreeDir = `${config.worktreesDir}/mission-${prNumber}-${action}`;
    const containerName = `gcli-${prNumber}-${action}`;
    const imageUri = DEFAULT_IMAGE_URI;

    // 1. Ensure the specific mission capsule is active
    const capsuleStatus = await this.provider.getCapsuleStatus(containerName);

    if (!capsuleStatus.running) {
      if (capsuleStatus.exists) {
        console.log(`   - Reviving isolated capsule ${containerName}...`);
        await this.provider.removeCapsule(containerName);
      } else {
        console.log(`   - Provisioning isolated capsule ${containerName}...`);
      }

      await this.provider.runCapsule({
        name: containerName,
        image: config.remoteWorkDir || imageUri, // Local worktree uses remoteWorkDir as source repo
        user: 'root',
        cpuLimit: '2',
        memoryLimit: '8g',
        mounts: [
          { host: config.remoteWorkDir, capsule: config.remoteWorkDir, readonly: true }, // MOUNT READ-ONLY
          { host: remoteWorktreeDir, capsule: remoteWorktreeDir, readonly: false }, // Specific Satellite Worktree RW
          { host: ORBIT_ROOT, capsule: ORBIT_ROOT, readonly: true }, // Broad mount as RO for shared assets
          { host: `${ORBIT_ROOT}/gemini-cli-config/.gemini`, capsule: '/home/node/.gemini', readonly: false }
        ],
        command: `/bin/bash -c "ln -sfn ${ORBIT_ROOT} /home/node/.orbit && while true; do sleep 1000; done"`
      });

      // Wait for capsule to stabilize
      await this.waitForCapsule(containerName, 10000);
    } else {
        console.log(`   ✅ Isolated capsule ${containerName} is already active.`);
    }

    // 2. Provision the repository using a reference clone for speed and isolation
    const check = await this.provider.getExecOutput(`ls -d ${remoteWorktreeDir}/.git`, { wrapCapsule: containerName, quiet: true });

    if (check.status !== 0) {
      // Clear previous history for this session only if we are doing a fresh provision
      const clearHistoryCmd = `rm -rf /home/node/.gemini/history/mission-${prNumber}-${action}*`;
      await this.provider.exec(clearHistoryCmd, { wrapCapsule: containerName });

      console.log(`   - Provisioning isolated git repo for PR #${prNumber} (inside capsule via reference)...`);
      
      // 3.1 Ensure remoteWorktreeDir parent is owned by node on the HOST first
      // Skip sudo if we are local
      const isLocal = (this.provider as any).projectId === 'local';
      const sudoPrefix = isLocal ? '' : 'sudo ';

      await this.provider.exec(`${sudoPrefix}mkdir -p ${config.worktreesDir} && ${sudoPrefix}chown -R 1000:1000 ${config.worktreesDir}`);
      await this.provider.exec(`${sudoPrefix}mkdir -p ${remoteWorktreeDir} && ${sudoPrefix}chown -R 1000:1000 ${remoteWorktreeDir}`);

      // 3.2 Perform Reference Clone inside the capsule
      // We point to the RO main repo as the reference
      const cloneCmd = `
        (unset GITHUB_TOKEN GH_TOKEN && gh auth status >/dev/null 2>&1) || (unset GITHUB_TOKEN GH_TOKEN && cat ${ORBIT_ROOT}/.gh_token | gh auth login --with-token) && \
        git config --global --add safe.directory '*' && \
        (rm -rf ${remoteWorktreeDir} || true) && \
        git clone --reference ${config.remoteWorkDir} --quiet -c core.filemode=false ${config.upstreamUrl} ${remoteWorktreeDir} && \
        cd ${remoteWorktreeDir} && \
        git config --replace-all core.filemode false && \
        git remote add upstream ${config.upstreamUrl} && \
        gh pr checkout ${prNumber}
      `;

      const setupRes = await this.provider.getExecOutput(cloneCmd.replace(/\n/g, ''), { wrapCapsule: containerName });
      if (setupRes.status !== 0) {
        throw new Error(`Failed to provision isolated repo: ${setupRes.stderr}`);
      }
      console.log('   ✅ Isolated repository provisioned successfully.');
    } else {
      console.log('   ✅ Remote repository ready.');
    }

    const isLocal = (this.provider as any).projectId === 'local';
    const sudoPrefix = isLocal ? '' : 'sudo ';
    await this.provider.exec(`${sudoPrefix}chown -R 1000:1000 ${remoteWorktreeDir}`, { wrapCapsule: containerName });
    return remoteWorktreeDir;
  }

  async waitForCapsule(name: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    process.stdout.write(`   - Waiting for capsule ${name} to stabilize...`);

    while (Date.now() - start < timeoutMs) {
      const res = await this.provider.getExecOutput('echo 1', { wrapCapsule: name, quiet: true });
      if (res.status === 0) {
        process.stdout.write(' ✅ Ready.\n');
        return;
      }
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 500));
    }

    process.stdout.write(' ❌ Timeout.\n');
    throw new Error(`Capsule ${name} failed to stabilize within ${timeoutMs}ms`);
  }
}

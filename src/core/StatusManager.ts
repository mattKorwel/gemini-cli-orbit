/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type InfrastructureSpec, type ProjectContext } from './Constants.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { type PulseInfo, type CapsuleInfo } from './types.js';

export class StatusManager {
  constructor(
    private readonly projectCtx: ProjectContext,
    private readonly infra: InfrastructureSpec,
  ) {}

  /**
   * Check station health and active mission status.
   */
  async getPulse(): Promise<PulseInfo> {
    const isLocal =
      !this.infra.projectId ||
      this.infra.projectId === 'local' ||
      (this.infra.providerType as any) === 'local-worktree';

    if (!isLocal && !this.infra.instanceName) {
      throw new Error(
        `Station name not configured. Check your profile or environment variables (GCLI_ORBIT_INSTANCE_NAME).`,
      );
    }

    const instanceName = this.infra.instanceName || 'local';
    const provider = ProviderFactory.getProvider(this.projectCtx, {
      ...this.infra,
      projectId: this.infra.projectId || 'local',
      zone: this.infra.zone || 'local',
      instanceName,
    } as any);

    const statusRes = await provider.getStatus();
    if (statusRes.status === 'UNKNOWN' || statusRes.status === 'ERROR') {
      throw new Error(
        `Station ${instanceName} is in an invalid state: ${statusRes.status}`,
      );
    }

    const capsules: CapsuleInfo[] = [];

    if (statusRes.status === 'RUNNING') {
      const containerNames = await provider.listCapsules();

      for (const containerName of containerNames) {
        const stats = await provider.getCapsuleStats(containerName);
        const tmuxRes = await provider.getExecOutput(
          'tmux list-sessions -F "#S" 2>/dev/null',
          { wrapCapsule: containerName, quiet: true },
        );

        let state: CapsuleInfo['state'] = 'IDLE';
        if (tmuxRes.status === 0 && tmuxRes.stdout.trim()) {
          const paneOutput = await provider.capturePane(containerName);
          const lines = paneOutput.trim().split('\n');
          const lastLine = lines[lines.length - 1] || '';
          const lastTwoLines = lines.slice(-2).join(' ');

          const isWaiting =
            lastLine.includes(' > ') ||
            lastLine.trim().endsWith('>') ||
            lastTwoLines.includes('(y/n)') ||
            lastLine.trim().endsWith('?') ||
            (lastLine.includes('node@') && lastLine.includes('$'));

          state = isWaiting ? 'WAITING' : 'THINKING';
        }

        capsules.push({
          name: containerName,
          state,
          stats,
        });
      }
    }

    return {
      stationName: instanceName,
      repoName: this.projectCtx.repoName,
      status: statusRes.status,
      internalIp: statusRes.internalIp || undefined,
      externalIp: statusRes.externalIp || undefined,
      capsules,
    };
  }
}

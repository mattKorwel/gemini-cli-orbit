/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type InfrastructureSpec,
  type ProjectContext,
} from '../core/Constants.js';
import { type PulseInfo, type CapsuleInfo } from '../core/types.js';
import { NodeExecutor } from '../core/executors/NodeExecutor.js';
import { type IProviderFactory } from '../core/interfaces.js';

export class StatusManager {
  constructor(
    private readonly projectCtx: ProjectContext,
    private readonly infra: InfrastructureSpec,
    private readonly providerFactory: IProviderFactory,
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
    const provider = this.providerFactory.getProvider(this.projectCtx, {
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
      const isLocalWorkspace = provider.type === 'local-worktree';
      const bundlePath = isLocalWorkspace ? 'bundle' : '/mnt/disks/data/bundle';

      const statusCmd = NodeExecutor.create(`${bundlePath}/station.js`, [
        'status',
      ]);
      const statusOutput = await provider.getExecOutput(statusCmd, {
        quiet: true,
      });

      let aggregatedMissions: any[] = [];
      if (statusOutput.status === 0) {
        try {
          const report = JSON.parse(statusOutput.stdout);
          aggregatedMissions = report.missions || [];
        } catch (_e) {
          // Fallback to legacy discovery if aggregator fails
        }
      }

      const containerNames = await provider.listCapsules();

      for (const containerName of containerNames) {
        const stats = await provider.getCapsuleStats(containerName);
        const missionState = aggregatedMissions.find(
          (m) =>
            m.mission === containerName || containerName.includes(m.mission),
        );

        if (missionState) {
          capsules.push({
            name: containerName,
            state: missionState.status,
            stats,
            lastThought: missionState.last_thought,
            blocker: missionState.blocker,
            progress: missionState.progress,
            pendingTool: missionState.pending_tool,
            lastQuestion: missionState.last_question,
          });
        } else {
          // Legacy/Fallback discovery
          const tmuxCmd = {
            bin: 'tmux',
            args: ['list-sessions', '-F', '#S'],
          };

          const tmuxRes = await provider.getExecOutput(tmuxCmd, {
            wrapCapsule: containerName,
            quiet: true,
          });

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

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type InfrastructureSpec,
  type ProjectContext,
  STATION_BUNDLE_PATH,
} from '../core/Constants.js';
import { type StationState, type CapsuleInfo } from '../core/types.js';
import {
  type IProviderFactory,
  type IExecutors,
  type IStationRegistry,
  type HydratedStation,
  type IStatusManager,
} from '../core/interfaces.js';

export class StatusManager implements IStatusManager {
  constructor(
    private readonly projectCtx: ProjectContext,
    private readonly infra: InfrastructureSpec,
    private readonly providerFactory: IProviderFactory,
    private readonly executors: IExecutors,
    private readonly stationRegistry: IStationRegistry,
  ) {}

  /**
   * Check station health and active mission status for the active project.
   */
  async getPulse(): Promise<StationState> {
    const all = await this.stationRegistry.listStations();
    // Default to the most relevant station (active project OR explicit name)
    const targetName = this.infra.instanceName;
    const target =
      all.find((s) => s.receipt.name === targetName) ||
      all.find((s) => s.receipt.repo === this.projectCtx.repoName);

    if (!target) {
      throw new Error(
        `No active station found for ${this.projectCtx.repoName}`,
      );
    }

    const states = await this.fetchFleetState([target], 'pulse');
    return states[0]!;
  }

  /**
   * Parallel aggregator for fleet status.
   */
  async fetchFleetState(
    stations: HydratedStation[],
    depth: 'inventory' | 'health' | 'pulse',
  ): Promise<StationState[]> {
    return Promise.all(
      stations.map(async (s) => {
        const state: StationState = {
          receipt: s.receipt,
          isActive: false, // Will be set by caller based on context
        };

        if (depth === 'inventory') return state;

        try {
          const reality = await s.provider.getStatus();
          state.reality = {
            status: reality.status,
            missions: [],
          };
          if (reality.internalIp) state.reality.internalIp = reality.internalIp;
          if (reality.externalIp) state.reality.externalIp = reality.externalIp;

          if (
            depth === 'pulse' &&
            reality.status === 'RUNNING' &&
            state.reality
          ) {
            state.reality.missions = await this.fetchMissionTelemetry(
              s.provider,
            );
          }
        } catch (_e: any) {
          state.reality = { status: 'UNREACHABLE', missions: [] };
        }

        return state;
      }),
    );
  }

  /**
   * Fetches deep mission status from inside the station.
   */
  private async fetchMissionTelemetry(
    provider: import('../providers/BaseProvider.js').OrbitProvider,
  ): Promise<CapsuleInfo[]> {
    const capsules: CapsuleInfo[] = [];

    const bundlePath = provider.resolveWorkerPath();
    const statusCmd = provider.createNodeCommand(bundlePath, ['status']);

    const statusOutput = await provider.getExecOutput(statusCmd, {
      quiet: true,
    });

    let aggregatedMissions: any[] = [];
    if (statusOutput.status === 0) {
      try {
        const report = JSON.parse(statusOutput.stdout);
        aggregatedMissions = report.missions || [];
      } catch (_e) {
        // Fallback
      }
    }

    const containerNames = await provider.listCapsules();

    for (const containerName of containerNames) {
      const stats = await provider.getCapsuleStats(containerName);
      const missionState = aggregatedMissions.find(
        (m) => m.mission === containerName || containerName.includes(m.mission),
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

    return capsules;
  }

  /**
   * Special case: Fetches pulse for ALL local stations registered on this machine.
   */
  async getGlobalLocalPulse(): Promise<StationState[]> {
    const all = await this.stationRegistry.listStations();
    const local = all.filter((s) => s.receipt.type === 'local-worktree');
    return this.fetchFleetState(local, 'pulse');
  }
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type InfrastructureSpec,
  type ProjectContext,
} from '../core/Constants.js';
import { type StationState } from '../core/types.js';
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
    peek = false,
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

          // Always fetch missions for local stations (zero-cost)
          // For remote stations, only fetch if depth is 'pulse'
          const shouldFetchMissions =
            depth === 'pulse' || s.receipt.type === 'local-worktree';

          if (
            shouldFetchMissions &&
            reality.status === 'RUNNING' &&
            state.reality
          ) {
            const missions = await s.provider.getMissionTelemetry(peek);
            // Standardize repo attribution for scoped aggregation
            missions.forEach((m) => {
              if (m.repo === 'unknown' || !m.repo) m.repo = s.receipt.repo;
            });
            state.reality.missions = missions;
          }
        } catch (_e: any) {
          state.reality = { status: 'UNREACHABLE', missions: [] };
        }

        return state;
      }),
    );
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

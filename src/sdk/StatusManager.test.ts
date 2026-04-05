/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { StatusManager } from './StatusManager.js';
import { flattenCommand } from '../core/executors/types.js';
import {
  type IProviderFactory,
  type IStationRegistry,
} from '../core/interfaces.js';

describe('StatusManager', () => {
  const mockProjectCtx = { repoRoot: '/root', repoName: 'test-repo' };
  const mockInfra = {
    instanceName: 'test-station',
    providerType: 'local-worktree',
  };
  let providerFactory: Mocked<IProviderFactory>;
  let stationRegistry: Mocked<IStationRegistry>;

  beforeEach(() => {
    vi.clearAllMocks();
    providerFactory = {
      getProvider: vi.fn(),
    } as any;
    stationRegistry = {
      listStations: vi.fn(),
      saveReceipt: vi.fn(),
      deleteReceipt: vi.fn(),
      getMissions: vi.fn(),
    } as any;
  });

  it('getPulse aggregates deep mission state from station worker', async () => {
    const mockProvider = {
      getStatus: vi
        .fn()
        .mockResolvedValue({ status: 'RUNNING', internalIp: '1.2.3.4' }),
      listCapsules: vi.fn().mockResolvedValue(['orbit-123-chat']),
      getCapsuleStats: vi.fn().mockResolvedValue('10% / 100MB'),
      getExecOutput: vi.fn().mockImplementation((cmd) => {
        const fullCmd = flattenCommand(cmd);
        if (fullCmd.includes('status')) {
          return {
            status: 0,
            stdout: JSON.stringify({
              missions: [
                {
                  mission: 'orbit-123-chat',
                  status: 'WAITING_FOR_INPUT',
                  last_question: 'How can I help?',
                },
              ],
            }),
          };
        }
        return { status: 1 };
      }),
      type: 'local-worktree',
    };

    providerFactory.getProvider.mockReturnValue(mockProvider as any);

    const mockExecutors: any = {
      node: {
        create: vi.fn().mockImplementation((path, args) => ({
          bin: 'node',
          args: [path, ...args],
        })),
      },
    };

    const manager = new StatusManager(
      mockProjectCtx as any,
      mockInfra as any,
      providerFactory,
      mockExecutors,
      stationRegistry,
    );
    const pulse = await manager.getPulse();

    expect(pulse.capsules).toHaveLength(1);
    expect(pulse.capsules[0]!.state).toBe('WAITING_FOR_INPUT');
    expect(pulse.capsules[0]!.lastQuestion).toBe('How can I help?');
  });

  it('getGlobalLocalPulse aggregates all local stations', async () => {
    const mockReceipts = [
      {
        name: 's1',
        instanceName: 's1',
        type: 'local-worktree',
        repo: 'r1',
        projectId: 'local',
        zone: 'local',
      },
      {
        name: 's2',
        instanceName: 's2',
        type: 'local-worktree',
        repo: 'r2',
        projectId: 'local',
        zone: 'local',
      },
      { name: 's3', instanceName: 's3', type: 'gce', repo: 'r3' }, // Should be filtered out
    ];

    stationRegistry.listStations.mockResolvedValue(mockReceipts as any);

    const mockProvider = {
      getStatus: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
      listCapsules: vi.fn().mockResolvedValue([]),
      getExecOutput: vi.fn().mockResolvedValue({ status: 1 }), // Failed aggregator
      type: 'local-worktree',
    };
    providerFactory.getProvider.mockReturnValue(mockProvider as any);

    const mockExecutors: any = {
      node: {
        create: vi
          .fn()
          .mockImplementation((path, args) => ({
            bin: 'node',
            args: [path, ...args],
          })),
      },
    };

    const manager = new StatusManager(
      mockProjectCtx as any,
      mockInfra as any,
      providerFactory,
      mockExecutors,
      stationRegistry,
    );

    const fleetPulse = await manager.getGlobalLocalPulse();
    expect(fleetPulse).toHaveLength(2);
    expect(fleetPulse[0]!.stationName).toBe('s1');
    expect(fleetPulse[1]!.stationName).toBe('s2');
  });
});

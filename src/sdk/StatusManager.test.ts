/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { StatusManager } from './StatusManager.js';
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
    } as any;
  });

  it('getPulse aggregates deep mission state from station worker', async () => {
    const mockProvider = {
      getStatus: vi
        .fn()
        .mockResolvedValue({ status: 'RUNNING', internalIp: '1.2.3.4' }),
      getMissionTelemetry: vi.fn().mockResolvedValue([
        {
          name: '123-chat',
          state: 'WAITING_FOR_INPUT',
          lastQuestion: 'How can I help?',
          stats: '10% / 100MB',
        },
      ]),
      type: 'local-worktree',
    };

    const mockReceipt = {
      name: 'test-station',
      instanceName: 'test-station',
      type: 'local-worktree',
      repo: 'test-repo',
    };

    stationRegistry.listStations.mockResolvedValue([
      {
        receipt: mockReceipt,
        provider: mockProvider,
      },
    ] as any);

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
      undefined,
      providerFactory,
      mockExecutors,
      stationRegistry,
    );
    const pulse = await manager.getPulse();

    expect(pulse.reality!.missions).toHaveLength(1);
    expect(pulse.reality!.missions[0]!.state).toBe('WAITING_FOR_INPUT');
    expect(pulse.reality!.missions[0]!.lastQuestion).toBe('How can I help?');
  });

  it('getGlobalLocalPulse aggregates all local stations', async () => {
    const mockProvider = {
      getStatus: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
      listCapsules: vi.fn().mockResolvedValue([]),
      getExecOutput: vi.fn().mockResolvedValue({ status: 1 }),
      type: 'local-worktree',
    };

    const mockStations = [
      {
        receipt: { name: 's1', type: 'local-worktree', repo: 'r1' },
        provider: mockProvider,
      },
      {
        receipt: { name: 's2', type: 'local-worktree', repo: 'r2' },
        provider: mockProvider,
      },
      {
        receipt: { name: 's3', type: 'gce', repo: 'r3' },
        provider: mockProvider,
      },
    ];

    stationRegistry.listStations.mockResolvedValue(mockStations as any);

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
      undefined,
      providerFactory,
      mockExecutors,
      stationRegistry,
    );

    const fleetState = await manager.getGlobalLocalPulse();
    expect(fleetState).toHaveLength(2);
    expect(fleetState[0]!.receipt.name).toBe('s1');
    expect(fleetState[1]!.receipt.name).toBe('s2');
  });

  it('fetchFleetState propagates peek flag to provider', async () => {
    const mockProvider = {
      getStatus: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
      getMissionTelemetry: vi.fn().mockResolvedValue([]),
      type: 'local-worktree',
    };

    const mockStation = {
      receipt: { name: 's1', type: 'local-worktree', repo: 'r1' },
      provider: mockProvider,
    };

    const manager = new StatusManager(
      mockProjectCtx as any,
      mockInfra as any,
      undefined,
      providerFactory,
      {} as any,
      stationRegistry,
    );

    await manager.fetchFleetState([mockStation] as any, 'pulse', true);
    expect(mockProvider.getMissionTelemetry).toHaveBeenCalledWith(true);
  });
});

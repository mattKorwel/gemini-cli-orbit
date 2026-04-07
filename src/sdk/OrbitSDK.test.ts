/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrbitSDK } from './OrbitSDK.js';

describe('OrbitSDK', () => {
  const mockContext = {
    project: { repoName: 'test-repo', repoRoot: '/root' },
    infra: { providerType: 'local-worktree' },
  };

  const mockStation = {
    receipt: { name: 's1', repo: 'test-repo' },
    provider: { type: 'local-worktree' },
  };

  const mockState = {
    receipt: mockStation.receipt,
    reality: {
      status: 'RUNNING',
      missions: [
        { name: 'm1-chat', state: 'IDLE' },
        { name: 'm2-fix', state: 'THINKING' },
      ],
    },
  };

  let sdk: OrbitSDK;
  let mockStatusManager: any;
  let mockStationRegistry: any;

  beforeEach(() => {
    mockStatusManager = {
      fetchFleetState: vi.fn().mockResolvedValue([mockState]),
    };
    mockStationRegistry = {
      listStations: vi.fn().mockResolvedValue([mockStation]),
    };

    sdk = new OrbitSDK(mockContext as any, {} as any);
    // Inject mocks
    (sdk as any).status = mockStatusManager;
    (sdk as any).status.stationRegistry = mockStationRegistry;
  });

  describe('getFleetState', () => {
    it('delegates to StatusManager.fetchFleetState', async () => {
      await sdk.getFleetState({ pulse: true } as any);
      expect(mockStatusManager.fetchFleetState).toHaveBeenCalled();
    });

    it('filters stations by name pattern', async () => {
      mockStationRegistry.listStations.mockResolvedValue([
        { receipt: { name: 'match-me', instanceName: 'match-me' } },
        { receipt: { name: 'no-match', instanceName: 'no-match' } },
      ]);

      await sdk.getFleetState({ nameFilter: 'match*' });

      const calls = mockStatusManager.fetchFleetState.mock.calls;
      const filteredStations = calls[0][0];
      expect(filteredStations).toHaveLength(1);
      expect(filteredStations[0].receipt.name).toBe('match-me');
    });

    it('implements surgical mission-level filtering', async () => {
      const results = await sdk.getFleetState({
        missionFilter: '*fix*',
        includeMissions: true,
      });

      expect(results).toHaveLength(1);
      const reality = results[0]?.reality;
      expect(reality).toBeDefined();
      expect(reality?.missions).toHaveLength(1);
      expect(reality?.missions?.[0]?.name).toBe('m2-fix');
    });

    it('returns empty array if no missions match filter', async () => {
      const results = await sdk.getFleetState({
        missionFilter: 'non-existent',
        includeMissions: true,
      });

      expect(results).toHaveLength(0);
    });

    it('propagates peek flag to StatusManager', async () => {
      await sdk.getFleetState({ peek: true });
      expect(mockStatusManager.fetchFleetState).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        true,
      );
    });
  });
});

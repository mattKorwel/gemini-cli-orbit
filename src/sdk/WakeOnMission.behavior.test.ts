/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StarfleetHarness } from '../test/StarfleetHarness.js';
import { MissionManager } from './MissionManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { StationRegistry } from './StationRegistry.js';
import { StarfleetClient } from './StarfleetClient.js';
import { ConfigManager } from '../core/ConfigManager.js';

describe('Wake-on-Mission Behavior', () => {
  let harness: StarfleetHarness;

  beforeEach(() => {
    harness = new StarfleetHarness('WakeOnMission');
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('triggers fleet provision when starting a mission on a hibernated station', async () => {
    const pm = harness.createProcessManager();
    const executors = ProviderFactory.getExecutors(pm);
    const factory = new ProviderFactory(pm, executors);
    const configManager = new ConfigManager();
    const stationRegistry = new StationRegistry(factory, configManager);

    // Mock the station registry to return a HIBERNATED station
    vi.spyOn(stationRegistry, 'listStations').mockResolvedValue([
      {
        receipt: { name: 'station-zeta', status: 'HIBERNATED' } as any,
        reality: { status: 'HIBERNATED', missions: [] } as any,
        provider: {} as any,
      },
    ]);

    const mockFleet = {
      provision: vi.fn().mockResolvedValue(0),
    };

    const manager = new MissionManager(
      { repoRoot: harness.root, repoName: 'test-repo' },
      {
        providerType: 'gce',
        instanceName: 'station-zeta',
        projectId: 'p1',
        zone: 'z1',
      } as any,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
      factory,
      configManager,
      pm,
      executors,
      stationRegistry,
      new StarfleetClient(),
    );

    manager.setFleetManager(mockFleet as any);

    // Mock verifyIgnition to pass immediately after wake
    const provider = (manager as any).getProvider();
    vi.spyOn(provider, 'verifyIgnition').mockResolvedValue(true);
    vi.spyOn(provider, 'launchMission').mockResolvedValue(0);

    const manifest = await manager.resolve({
      identifier: 'wake-test',
      action: 'chat',
    });
    await manager.start(manifest);

    // Verify fleet.provision was called for the hibernated station
    expect(mockFleet.provision).toHaveBeenCalledWith(
      expect.objectContaining({ instanceName: 'station-zeta' }),
    );
  });
});

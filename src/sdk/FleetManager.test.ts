/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { FleetManager } from './FleetManager.js';
import {
  type IStationRegistry,
  type ISchematicManager,
  type IProviderFactory,
  type IInfrastructureFactory,
  type IConfigManager,
  type IDependencyManager,
} from '../core/interfaces.js';

describe('FleetManager', () => {
  const projectCtx = { repoRoot: '/repo', repoName: 'test-repo' };
  const infraSpec = {
    instanceName: 'test-station',
    providerType: 'gce',
    projectId: 'test-project',
  };
  const observer = { onLog: vi.fn(), onDivider: vi.fn() };

  let fleet: FleetManager;
  let mockProvisioner: any;
  let mockProvider: any;
  let stationRegistry: Mocked<IStationRegistry>;
  let schematicManager: Mocked<ISchematicManager>;
  let providerFactory: Mocked<IProviderFactory>;
  let infraFactory: Mocked<IInfrastructureFactory>;
  let configManager: Mocked<IConfigManager>;
  let dependencyManager: Mocked<IDependencyManager>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProvisioner = {
      up: vi.fn().mockResolvedValue({ status: 'ready', publicIp: '1.2.3.4' }),
      down: vi.fn().mockResolvedValue(undefined),
    };

    mockProvider = {
      ensureReady: vi.fn().mockResolvedValue(0),
      listCapsules: vi.fn().mockResolvedValue([]),
      stopCapsule: vi.fn().mockResolvedValue(0),
      removeCapsule: vi.fn().mockResolvedValue(0),
      exec: vi.fn().mockResolvedValue(0),
      getStationReceipt: vi.fn().mockReturnValue({ name: 'test-station' }),
    };

    stationRegistry = {
      listStations: vi.fn().mockResolvedValue([]),
      saveReceipt: vi.fn(),
      deleteReceipt: vi.fn(),
    } as any;

    schematicManager = {
      listSchematics: vi.fn(),
      importSchematic: vi.fn(),
      runWizard: vi.fn(),
    } as any;

    providerFactory = {
      getProvider: vi.fn().mockReturnValue(mockProvider),
    } as any;

    infraFactory = {
      getProvisioner: vi.fn().mockReturnValue(mockProvisioner),
    } as any;

    configManager = {
      loadSettings: vi.fn().mockReturnValue({ repos: {} }),
      saveSettings: vi.fn(),
      loadSchematic: vi.fn().mockReturnValue({}),
      saveSchematic: vi.fn(),
      loadJson: vi.fn(),
      detectRemoteUrl: vi.fn(),
    } as any;

    dependencyManager = {
      ensurePulumi: vi.fn().mockResolvedValue('path/to/pulumi'),
    } as any;

    const mockExecutors: any = {};
    const mockStatusManager: any = {
      fetchFleetState: vi.fn().mockResolvedValue([]),
    };

    fleet = new FleetManager(
      projectCtx as any,
      infraSpec as any,
      observer as any,
      stationRegistry,
      schematicManager,
      providerFactory,
      infraFactory,
      configManager,
      dependencyManager,
      mockExecutors,
      mockStatusManager,
    );
  });

  it('should use instanceName as the provisioner key for isolated stacks during provision', async () => {
    await fleet.provision({ schematicName: 'some-schematic' });

    expect(infraFactory.getProvisioner).toHaveBeenCalledWith(
      'test-station', // instanceName
      expect.any(Object),
    );
  });

  it('should use instanceName as the provisioner key during splashdown', async () => {
    const mockReceipt = {
      name: 'test-station',
      instanceName: 'actual-instance-name',
      type: 'gce',
      projectId: 'p',
      zone: 'z',
    };
    stationRegistry.listStations.mockResolvedValue([
      { receipt: mockReceipt, provider: mockProvider },
    ] as any);

    await fleet.splashdown({ name: 'test-station', force: true });

    expect(infraFactory.getProvisioner).toHaveBeenCalledWith(
      'actual-instance-name',
      expect.objectContaining({ name: 'test-station' }),
    );
  });

  it('should clean up RAM-disk mission secrets during splashdown', async () => {
    const mockReceipt = {
      name: 'test-station',
      instanceName: 'test-instance',
      type: 'gce',
      projectId: 'p',
      zone: 'z',
    };
    stationRegistry.listStations.mockResolvedValue([
      { receipt: mockReceipt, provider: mockProvider },
    ] as any);
    mockProvider.listCapsules.mockResolvedValue(['orbit-mission-1']);

    await fleet.splashdown({ name: 'test-station', force: true });

    // Should cleanup secrets
    expect(mockProvider.exec).toHaveBeenCalledWith(
      expect.stringContaining('rm -f /dev/shm/.orbit-env-'),
    );
  });
});

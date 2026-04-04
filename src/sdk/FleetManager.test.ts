/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FleetManager } from './FleetManager.js';
import { InfrastructureFactory } from '../infrastructure/InfrastructureFactory.js';
import { StationRegistry } from './StationRegistry.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { loadSchematic, loadSettings } from '../core/ConfigManager.js';

vi.mock('../infrastructure/InfrastructureFactory.js');
vi.mock('./StationRegistry.js');
vi.mock('../providers/ProviderFactory.js');
vi.mock('../core/ConfigManager.js');
vi.mock('./DependencyManager.js', () => ({
  DependencyManager: {
    ensurePulumi: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('node:readline', () => ({
  default: {
    createInterface: vi.fn().mockReturnValue({
      question: vi.fn().mockImplementation((_q, cb) => cb('y')),
      close: vi.fn(),
    }),
  },
}));

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
    };

    (InfrastructureFactory.getProvisioner as any).mockReturnValue(
      mockProvisioner,
    );
    (ProviderFactory.getProvider as any).mockReturnValue(mockProvider);
    (StationRegistry.prototype.listStations as any).mockResolvedValue([]);
    (loadSchematic as any).mockReturnValue({});
    (loadSettings as any).mockReturnValue({ repos: {} });

    fleet = new FleetManager(projectCtx, infraSpec as any, observer as any);
  });

  it('should use instanceName as the provisioner key for isolated stacks during provision', async () => {
    await fleet.provision({ schematicName: 'some-schematic' });

    expect(InfrastructureFactory.getProvisioner).toHaveBeenCalledWith(
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
    (StationRegistry.prototype.listStations as any).mockResolvedValue([
      mockReceipt,
    ]);

    await fleet.splashdown({ name: 'test-station', force: true });

    expect(InfrastructureFactory.getProvisioner).toHaveBeenCalledWith(
      'actual-instance-name',
      expect.objectContaining({ name: 'test-station' }),
    );
  });
});

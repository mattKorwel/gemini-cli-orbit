/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runFleet } from './fleet.js';
import * as ConfigManager from './ConfigManager.js';

const mockProvisionStation = vi.fn().mockResolvedValue(0);
const mockDeleteStation = vi.fn().mockResolvedValue(undefined);
const mockSplashdown = vi.fn().mockResolvedValue(0);
const mockListStations = vi.fn().mockResolvedValue([]);
const mockActivateStation = vi.fn().mockResolvedValue(undefined);
const mockHibernate = vi.fn().mockResolvedValue(undefined);
const mockListSchematics = vi.fn().mockReturnValue(['d1']);
const mockRunSchematicWizard = vi.fn().mockResolvedValue(undefined);

vi.mock('../sdk/OrbitSDK.js', () => ({
  OrbitSDK: vi.fn().mockImplementation(() => ({
    provisionStation: mockProvisionStation,
    deleteStation: mockDeleteStation,
    splashdown: mockSplashdown,
    listStations: mockListStations,
    activateStation: mockActivateStation,
    hibernate: mockHibernate,
    listSchematics: mockListSchematics,
    runSchematicWizard: mockRunSchematicWizard,
    observer: { onDivider: vi.fn() },
  })),
}));

vi.mock('./ConfigManager.js');

describe('runFleet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ConfigManager.detectRepoName as any).mockReturnValue('repo');
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      instanceName: 'inst',
    } as any);
  });

  it('should route schematic subcommand to OrbitSDK.listSchematics', async () => {
    await runFleet(['schematic', 'list']);
    expect(mockListSchematics).toHaveBeenCalled();
  });

  it('should route liftoff subcommand to OrbitSDK.provisionStation', async () => {
    await runFleet(['station', 'liftoff']);
    expect(mockProvisionStation).toHaveBeenCalled();
  });

  it('should route hibernate subcommand to OrbitSDK.hibernate', async () => {
    await runFleet(['station', 'hibernate', 'target']);
    expect(mockHibernate).toHaveBeenCalledWith({ name: 'target' });
  });

  it('should route delete subcommand to OrbitSDK.splashdown', async () => {
    await runFleet(['station', 'delete', 'target']);
    expect(mockSplashdown).toHaveBeenCalledWith({ name: 'target' });
  });

  it('should route list subcommand to OrbitSDK.listStations', async () => {
    await runFleet(['station', 'list']);
    expect(mockListStations).toHaveBeenCalled();
  });
});

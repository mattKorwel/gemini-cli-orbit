/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runFleet } from './fleet.js';
import * as ConfigManager from './ConfigManager.js';
import { SchematicManager } from './SchematicManager.js';
import { runSetup } from './setup.js';
import { runSplashdown } from './splashdown.js';

import { StationManager } from './StationManager.js';

vi.mock('./ConfigManager.js');
vi.mock('./SchematicManager.js');
vi.mock('./StationManager.js');
vi.mock('./setup.js');
vi.mock('./splashdown.js');
vi.mock('./providers/ProviderFactory.js');

describe('runFleet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ConfigManager.detectRepoName as any).mockReturnValue('repo');
    ( ConfigManager.loadSettings as any).mockReturnValue({
      activeStation: 'inst',
    } as any);
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      instanceName: 'inst',
    } as any);
  });

  it('should route schematic subcommand to SchematicManager', async () => {
    const managerSpy = vi
      .spyOn(SchematicManager.prototype, 'listSchematics')
      .mockReturnValue(['d1']);
    await runFleet(['schematic', 'list']);
    expect(managerSpy).toHaveBeenCalled();
  });

  it('should route liftoff subcommand to runSetup', async () => {
    await runFleet(['station', 'liftoff']);
    expect(runSetup).toHaveBeenCalled();
  });

  it('should route delete subcommand to runSplashdown with --all', async () => {
    await runFleet(['station', 'delete']);
    expect(runSplashdown).toHaveBeenCalledWith(['--all']);
  });

  it('should route list subcommand to stationManager.listStations', async () => {
    const listSpy = vi
      .spyOn(StationManager.prototype, 'listStations')
      .mockResolvedValue([]);

    await runFleet(['station', 'list']);
    expect(listSpy).toHaveBeenCalled();
  });
});

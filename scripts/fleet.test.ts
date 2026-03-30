/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runFleet } from './fleet.js';
import * as ConfigManager from './ConfigManager.js';
import { DesignManager } from './DesignManager.js';
import { runSetup } from './setup.js';
import { runSplashdown } from './splashdown.js';
import { ProviderFactory } from './providers/ProviderFactory.js';

vi.mock('./ConfigManager.js');
vi.mock('./DesignManager.js');
vi.mock('./setup.js');
vi.mock('./splashdown.js');
vi.mock('./providers/ProviderFactory.js');

describe('runFleet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConfigManager.detectRepoName).mockReturnValue('repo');
    vi.mocked(ConfigManager.loadSettings).mockReturnValue({
      activeProfile: 'default',
    } as any);
    vi.mocked(ConfigManager.getRepoConfig).mockReturnValue({
      instanceName: 'inst',
    } as any);
  });

  it('should route design subcommand to DesignManager', async () => {
    const managerSpy = vi
      .spyOn(DesignManager.prototype, 'listDesigns')
      .mockReturnValue(['d1']);
    await runFleet(['design', 'list']);
    expect(managerSpy).toHaveBeenCalled();
  });

  it('should route liftoff subcommand to runSetup', async () => {
    await runFleet(['liftoff']);
    expect(runSetup).toHaveBeenCalled();
  });

  it('should route delete subcommand to runSplashdown with --all', async () => {
    await runFleet(['delete']);
    expect(runSplashdown).toHaveBeenCalledWith(['--all']);
  });

  it('should route list subcommand to provider.listStations', async () => {
    const mockProvider = { listStations: vi.fn().mockResolvedValue(0) };
    vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider as any);

    await runFleet(['list']);
    expect(mockProvider.listStations).toHaveBeenCalled();
  });
});

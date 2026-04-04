/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { StationRegistry } from './StationRegistry.js';
import fs from 'node:fs';
import {
  type IProviderFactory,
  type IConfigManager,
} from '../core/interfaces.js';

vi.mock('node:fs');
vi.mock('../core/Logger.js');

describe('StationRegistry', () => {
  let registry: StationRegistry;
  let providerFactory: Mocked<IProviderFactory>;
  let configManager: Mocked<IConfigManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    providerFactory = {
      getProvider: vi.fn(),
    } as any;
    configManager = {
      loadSettings: vi.fn().mockReturnValue({ repos: {} }),
      saveSettings: vi.fn(),
      loadSchematic: vi.fn(),
      saveSchematic: vi.fn(),
      loadJson: vi.fn(),
      detectRemoteUrl: vi.fn(),
    } as any;
    registry = new StationRegistry(providerFactory, configManager);
  });

  it('should list stations from disk and settings', async () => {
    (fs.readdirSync as any).mockReturnValue(['station-1.json']);
    configManager.loadJson.mockReturnValue({
      name: 'station-1',
      type: 'gce',
      projectId: 'p1',
      zone: 'z1',
      repo: 'test-repo',
    });

    const stations = await registry.listStations();
    expect(stations).toHaveLength(1);
    expect(stations[0]!.name).toBe('station-1');
  });

  it('should discover local stations from settings', async () => {
    (fs.readdirSync as any).mockReturnValue([]);
    configManager.loadSettings.mockReturnValue({
      repos: {
        'some-repo': { projectId: 'local' },
      },
    });

    const stations = await registry.listStations();
    expect(stations).toHaveLength(1);
    expect(stations[0]!.name).toBe('local-some-repo');
  });
});

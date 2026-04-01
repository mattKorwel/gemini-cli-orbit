/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline';

// Mock Constants before importing anything that uses them
vi.mock('./Constants.ts', () => ({
  ORBIT_ROOT: '/mnt/disks/data',
  MAIN_REPO_PATH: '/mnt/disks/data/main',
  SATELLITE_WORKTREES_PATH: '/mnt/disks/data/worktrees',
  POLICIES_PATH: '/mnt/disks/data/policies',
  SCRIPTS_PATH: '/mnt/disks/data/scripts',
  EXTENSION_REMOTE_PATH: '/mnt/disks/data/extension',
  CONFIG_DIR: '/mnt/disks/data/gemini-cli-config/.gemini',
  PROFILES_DIR: '/Users/mattkorwel/.gemini/orbit/profiles',
  GLOBAL_ORBIT_DIR: '/Users/mattkorwel/.gemini/orbit',
  GLOBAL_SETTINGS_PATH: '/Users/mattkorwel/.gemini/orbit/settings.json',
  SCHEMATICS_DIR: '/Users/mattkorwel/.gemini/orbit/schematics',
  STATIONS_DIR: '/Users/mattkorwel/.gemini/orbit/stations',
  PROJECT_ORBIT_DIR: '/work-dir/.gemini/orbit',
  PROJECT_CONFIG_PATH: '/work-dir/.gemini/orbit/config.json',
  ORBIT_LOG_PATH: '/work-dir/.gemini/orbit/orbit.log',
  GLOBAL_TOKENS_DIR: '/Users/mattkorwel/.gemini/orbit/tokens',
  UPSTREAM_REPO_URL: 'https://github.com/google-gemini/gemini-cli.git',
  UPSTREAM_ORG: 'google-gemini',
  DEFAULT_REPO_NAME: 'gemini-cli',
  DEFAULT_DNS_SUFFIX: '',
  DEFAULT_USER_SUFFIX: '',
  DEFAULT_IMAGE_URI: 'mock-image',
  DEFAULT_TEMP_DIR: '/Users/mattkorwel/.gemini/orbit/tmp',
}));

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('node:readline');
vi.mock('../providers/ProviderFactory.js');
vi.mock('../infrastructure/InfrastructureFactory.js');
vi.mock('./ConfigManager.js');

// Import runSetup after mocks
import { runSetup } from './setup.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { InfrastructureFactory } from '../infrastructure/InfrastructureFactory.js';
import * as ConfigManager from './ConfigManager.js';

describe('runSetup', () => {
  const mockProvider = {
    ensureReady: vi.fn().mockResolvedValue(0),
    exec: vi.fn().mockResolvedValue(0),
    sync: vi.fn().mockResolvedValue(0),
    getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: '' }),
  };

  const mockInfra = {
    up: vi.fn().mockResolvedValue({
      status: 'ready',
      privateIp: '10.0.0.5',
      publicIp: '34.0.0.5',
    }),
    down: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(ProviderFactory, 'getProvider').mockReturnValue(mockProvider as any);
    vi.spyOn(InfrastructureFactory, 'getProvisioner').mockReturnValue(mockInfra as any);

    (ConfigManager.detectRepoName as any).mockReturnValue('gemini-cli');
    ( ConfigManager.loadSettings as any).mockReturnValue({ repos: {} });
    ( ConfigManager.loadProjectConfig as any).mockReturnValue({
      upstreamRepo: 'google-gemini/gemini-cli',
    });
    ( ConfigManager.sanitizeName as any).mockImplementation((n: string) =>
      n.replace(/[^a-zA-Z0-9\-_]/g, ''),
    );
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      projectId: 'test-p',
      zone: 'test-z',
      repoName: 'gemini-cli',
      instanceName: 'test-i',
      stationName: 'test-s',
    });
    ( ConfigManager.loadSchematic as any).mockReturnValue({});

    // Default mock for readline
    ( readline.createInterface as any).mockReturnValue({
      question: vi.fn().mockImplementation((_q, cb) => cb('')),
      close: vi.fn(),
    } as any);

    ( fs.existsSync as any).mockReturnValue(false);
    ( fs.readdirSync as any).mockReturnValue([] as any);
    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: Buffer.from(
        '{"name": "gemini-cli", "nameWithOwner": "google-gemini/gemini-cli"}',
      ),
    } as any);
  });

  it('should run setup flow and wake up station', async () => {
    const res = await runSetup([]);

    expect(res).toBe(0);
    expect(mockInfra.up).toHaveBeenCalled();
    expect(ProviderFactory.getProvider).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ status: 'ready' }),
    );
    expect(mockProvider.ensureReady).toHaveBeenCalled();
  });

  it('should decommission infrastructure when --destroy is provided', async () => {
    const res = await runSetup(['--destroy']);
    expect(res).toBe(0);
    expect(mockInfra.down).toHaveBeenCalled();
    expect(mockInfra.up).not.toHaveBeenCalled();
  });

  it('should ignore "liftoff" when passed as the first argument', async () => {
    const res = await runSetup(['liftoff']);
    expect(res).toBe(0);
    expect(ConfigManager.loadSchematic).toHaveBeenCalledWith('default');
  });
});

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
vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');

// Import runSetup after mocks
import { runSetup } from './setup.js';
import { ProviderFactory } from './providers/ProviderFactory.js';
import * as ConfigManager from './ConfigManager.js';

describe('runSetup', () => {
  const mockProvider = {
    getStatus: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
    ensureReady: vi.fn().mockResolvedValue(0),
    provision: vi.fn().mockResolvedValue(0),
    setup: vi.fn().mockResolvedValue(0),
    exec: vi.fn().mockResolvedValue(0),
    sync: vi.fn().mockResolvedValue(0),
    getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: '' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider as any);

    vi.mocked(ConfigManager.detectRepoName).mockReturnValue('gemini-cli');
    vi.mocked(ConfigManager.loadSettings).mockReturnValue({ repos: {} });
    vi.mocked(ConfigManager.loadProjectConfig).mockReturnValue({
      upstreamRepo: 'google-gemini/gemini-cli',
    });
    vi.mocked(ConfigManager.sanitizeName).mockImplementation((n) =>
      n.replace(/[^a-zA-Z0-9\-_]/g, ''),
    );
    vi.mocked(ConfigManager.getRepoConfig).mockReturnValue({
      projectId: 'test-p',
      zone: 'test-z',
      repoName: 'gemini-cli',
      instanceName: 'test-i',
    });

    // Default mock for readline
    vi.mocked(readline.createInterface).mockReturnValue({
      question: vi.fn().mockImplementation((q, cb) => cb('')),
      close: vi.fn(),
    } as any);

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: Buffer.from(
        '{"name": "gemini-cli", "nameWithOwner": "google-gemini/gemini-cli"}',
      ),
    } as any);
  });

  it('should run setup flow and wake up station', async () => {
    const res = await runSetup({
      ...process.env,
      GOOGLE_CLOUD_PROJECT: 'test-p',
    });

    expect(res).toBe(0);
    // In current implementation, if status is RUNNING, it doesn't call provision but might check ready
    expect(mockProvider.getStatus).toHaveBeenCalled();
  });

  it('should detect existing configuration', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        repos: {
          'gemini-cli': {
            projectId: 'p',
            zone: 'z',
            instanceName: 'i',
            repoName: 'gemini-cli',
          },
        },
        activeRepo: 'gemini-cli',
      }),
    );

    // ConfigManager.loadSettings should return this
    vi.mocked(ConfigManager.loadSettings).mockReturnValue({
      repos: {
        'gemini-cli': {
          projectId: 'p',
          zone: 'z',
          instanceName: 'i',
          repoName: 'gemini-cli',
        },
      },
      activeRepo: 'gemini-cli',
    });

    // Mock confirm to say yes to using existing config
    const rl = {
      question: vi.fn().mockImplementation((q, cb) => cb('y')),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(rl as any);

    const res = await runSetup({
      ...process.env,
    });
    expect(res).toBe(0);
    expect(mockProvider.getStatus).toHaveBeenCalled();
  });
});

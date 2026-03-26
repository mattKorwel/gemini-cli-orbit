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
    WORKSPACES_ROOT: '/mnt/disks/data',
    MAIN_REPO_PATH: '/mnt/disks/data/main',
    WORKTREES_PATH: '/mnt/disks/data/worktrees',
    POLICIES_PATH: '/mnt/disks/data/policies',
    SCRIPTS_PATH: '/mnt/disks/data/scripts',
    EXTENSION_REMOTE_PATH: '/mnt/disks/data/extension',
    CONFIG_DIR: '/mnt/disks/data/gemini-cli-config/.gemini',
    PROFILES_DIR: '/Users/mattkorwel/dev/main/.gemini/workspaces/profiles',
    GLOBAL_WORKSPACES_DIR: '/Users/mattkorwel/dev/main/.gemini/workspaces',
    GLOBAL_SETTINGS_PATH: '/Users/mattkorwel/dev/main/.gemini/workspaces/settings.json',
    PROJECT_WORKSPACES_DIR: '/work-dir/.gemini/workspaces',
    PROJECT_CONFIG_PATH: '/work-dir/.gemini/workspaces/config.json',
    UPSTREAM_REPO_URL: 'https://github.com/google-gemini/gemini-cli.git',
    UPSTREAM_ORG: 'google-gemini',
    DEFAULT_REPO_NAME: 'gemini-cli',
    DEFAULT_DNS_SUFFIX: '',
    DEFAULT_USER_SUFFIX: '',
    DEFAULT_IMAGE_URI: 'mock-image'
}));

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('node:readline');
vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts');

// Import runSetup after mocks
import { runSetup } from './setup.ts';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import * as ConfigManager from './ConfigManager.ts';

describe('runSetup', () => {
  const mockProvider = {
    getStatus: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
    ensureReady: vi.fn().mockResolvedValue(0),
    setup: vi.fn().mockResolvedValue(0),
    exec: vi.fn().mockResolvedValue(0),
    sync: vi.fn().mockResolvedValue(0),
    getExecOutput: vi.fn().mockResolvedValue({ status: 0, stdout: '' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ProviderFactory.getProvider).mockReturnValue(mockProvider as any);
    
    vi.mocked(ConfigManager.detectRepoName).mockReturnValue('gemini-cli');
    vi.mocked(ConfigManager.loadGlobalSettings).mockReturnValue({ repos: {} });
    vi.mocked(ConfigManager.loadProjectConfig).mockReturnValue({ upstreamRepo: 'google-gemini/gemini-cli' });
    vi.mocked(ConfigManager.getRepoConfig).mockReturnValue({ 
        projectId: 'test-p', 
        zone: 'test-z',
        repoName: 'gemini-cli'
    });

    // Default mock for readline
    vi.mocked(readline.createInterface).mockReturnValue({
      question: vi.fn().mockImplementation((q, cb) => cb('')),
      close: vi.fn(),
    } as any);

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: Buffer.from('{"name": "gemini-cli", "nameWithOwner": "google-gemini/gemini-cli"}') } as any);
  });

  it('should run setup flow and sync the full extension', async () => {
    // We pass --yes to skip interactive prompts and provide a mock token
    const res = await runSetup({ 
        ...process.env, 
        GOOGLE_CLOUD_PROJECT: 'test-p',
        WORKSPACE_GH_TOKEN: 'mock-token'
    });
    
    expect(res).toBe(0);
    expect(mockProvider.setup).toHaveBeenCalled();
    
    // Verify full extension sync
    expect(mockProvider.sync).toHaveBeenCalledWith(
        expect.stringMatching(/\/$/), // Source (EXTENSION_ROOT/)
        expect.stringContaining('/mnt/disks/data/extension/'), // Target
        expect.objectContaining({ 
            delete: true, 
            sudo: true,
            exclude: expect.arrayContaining(['node_modules', '.git'])
        })
    );

    // Verify extension linking inside container
    expect(mockProvider.exec).toHaveBeenCalledWith(
        expect.stringContaining('sudo docker exec -u node -e GEMINI_API_KEY=dummy development-worker /usr/local/share/npm-global/bin/gemini extensions link /mnt/disks/data/extension')
    );
  });

  it('should detect existing configuration', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      repos: {
        'gemini-cli': { projectId: 'p', zone: 'z', instanceName: 'i', repoName: 'gemini-cli' }
      },
      activeRepo: 'gemini-cli'
    }));

    // Mock confirm to say yes to using existing config
    const rl = {
        question: vi.fn().mockImplementation((q, cb) => cb('y')),
        close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(rl as any);

    const res = await runSetup({ ...process.env, WORKSPACE_GH_TOKEN: 'mock-token' });
    expect(res).toBe(0);
    
    // Should skip some configuration prompts but still run execution phases
    expect(mockProvider.setup).toHaveBeenCalled();
  });
});

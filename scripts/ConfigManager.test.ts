/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import { spawnSync } from 'node:child_process';

vi.mock('node:fs');
vi.mock('node:child_process');

describe('ConfigManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '/work-dir/test-repo\n',
    } as any);
    // Default to no files existing
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it('should resolve config using hierarchy', () => {
    // 1. Project Default
    const projectConfig = {
      upstreamRepo: 'org/repo',
      imageUri: 'project-image',
    };

    // 2. Global Registry (User override for this repo)
    const globalSettings = {
      activeStation: 'corp-station',
      repos: {
        'test-repo': { imageUri: 'user-override-image' },
      },
    };

    // 2.5 Station Receipt
    const stationReceipt = {
      name: 'corp-station',
      projectId: 'station-p',
      zone: 'station-z',
      schematic: 'corp',
    };

    // 3. Schematic (Environment data)
    const schematicData = { projectId: 'corp-p', zone: 'corp-z' };

    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      if (p.includes('config.json')) return true;
      if (p.includes('settings.json')) return true;
      if (p.includes('stations/corp-station.json')) return true;
      if (p.includes('schematics/corp.json')) return true;
      return false;
    });

    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      if (p.includes('config.json')) return JSON.stringify(projectConfig);
      if (p.includes('settings.json')) return JSON.stringify(globalSettings);
      if (p.includes('stations/corp-station.json'))
        return JSON.stringify(stationReceipt);
      if (p.includes('schematics/corp.json'))
        return JSON.stringify(schematicData);
      return '';
    });

    const config = getRepoConfig();

    expect(config.repoName).toBe('test-repo');
    expect(config.upstreamRepo).toBe('org/repo'); // From Project Default
    expect(config.imageUri).toBe('user-override-image'); // From Global Registry (Override)
    expect(config.projectId).toBe('corp-p'); // From Schematic (overrides station receipt)
    expect(config.zone).toBe('corp-z'); // From Schematic
  });

  it('should override with environment variables', () => {
    process.env.GCLI_ORBIT_PROJECT_ID = 'env-p';

    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');

    const config = getRepoConfig();
    expect(config.projectId).toBe('env-p');

    delete process.env.GCLI_ORBIT_PROJECT_ID;
  });

  it('should detect repo name from origin remote (HTTPS)', () => {
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'remote') {
        return {
          status: 0,
          stdout: 'https://github.com/org/real-repo.git\n',
        } as any;
      }
      return { status: 1 } as any;
    });

    const name = detectRepoName();
    expect(name).toBe('real-repo');
  });

  it('should detect repo name from origin remote (SSH)', () => {
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'remote') {
        return {
          status: 0,
          stdout: 'git@github.com:org/ssh-repo.git\n',
        } as any;
      }
      return { status: 1 } as any;
    });

    const name = detectRepoName();
    expect(name).toBe('ssh-repo');
  });

  it('should fallback to git root basename if remote fails', () => {
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === 'git' && args?.[0] === 'remote') return { status: 1 } as any;
      if (cmd === 'git' && args?.[0] === 'rev-parse') {
        return {
          status: 0,
          stdout: '/path/to/my-git-root\n',
        } as any;
      }
      return { status: 1 } as any;
    });

    const name = detectRepoName();
    expect(name).toBe('my-git-root');
  });

  it('should fallback to default repo name if git fails', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1 } as any);
    const name = detectRepoName();
    expect(name).toBe('gemini-cli');
  });
});

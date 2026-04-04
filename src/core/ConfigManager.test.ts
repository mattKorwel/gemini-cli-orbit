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
    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: '/work-dir/test-repo\n',
    } as any);
    // Default to no files existing
    (fs.existsSync as any).mockReturnValue(false);
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

    const norm = (p: any) => String(p).replace(/\\/g, '/');
    (fs.existsSync as any).mockImplementation((p: any) => {
      const n = norm(p);
      if (n.includes('config.json')) return true;
      if (n.includes('settings.json')) return true;
      if (n.includes('stations/corp-station.json')) return true;
      if (n.includes('schematics/corp.json')) return true;
      return false;
    });

    (fs.readFileSync as any).mockImplementation((p: any) => {
      const n = norm(p);
      if (n.includes('config.json')) return JSON.stringify(projectConfig);
      if (n.includes('settings.json')) return JSON.stringify(globalSettings);
      if (n.includes('stations/corp-station.json'))
        return JSON.stringify(stationReceipt);
      if (n.includes('schematics/corp.json'))
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

    (fs.existsSync as any).mockReturnValue(false);
    (fs.readFileSync as any).mockReturnValue('{}');

    const config = getRepoConfig();
    expect(config.projectId).toBe('env-p');

    delete process.env.GCLI_ORBIT_PROJECT_ID;
  });

  it('should ignore global settings when ignoreGlobalState is true', () => {
    // Global override for this repo
    const globalSettings = {
      activeStation: 'global-station',
      repos: {
        'test-repo': { imageUri: 'user-override-image' },
      },
    };

    const norm = (p: any) => String(p).replace(/\\/g, '/');
    (fs.existsSync as any).mockImplementation((p: any) => {
      const n = norm(p);
      return n.includes('settings.json');
    });

    (fs.readFileSync as any).mockImplementation((p: any) => {
      const n = norm(p);
      if (n.includes('settings.json')) return JSON.stringify(globalSettings);
      return '{}';
    });

    // 1. With global state (default)
    const configWithState = getRepoConfig('test-repo');
    expect(configWithState.imageUri).toBe('user-override-image');
    expect(configWithState.stationName).toBe('global-station');

    // 2. Ignoring global state
    const configStateless = getRepoConfig('test-repo', {}, process.cwd(), {
      ignoreGlobalState: true,
    });
    expect(configStateless.imageUri).not.toBe('user-override-image');
    expect(configStateless.stationName).toBe('test-repo'); // Should fallback to repo name
  });

  it('should prioritize per-repo activeStation over global', () => {
    const globalSettings = {
      activeStation: 'global-station',
      repos: {
        'my-repo': { activeStation: 'repo-specific-station' },
      },
    };

    const norm = (p: any) => String(p).replace(/\\/g, '/');
    (fs.existsSync as any).mockImplementation((p: any) => {
      const n = norm(p);
      return n.includes('settings.json');
    });

    (fs.readFileSync as any).mockImplementation((p: any) => {
      const n = norm(p);
      if (n.includes('settings.json')) return JSON.stringify(globalSettings);
      return '{}';
    });

    const config = getRepoConfig('my-repo');
    expect(config.stationName).toBe('repo-specific-station');
  });

  it('should detect repo name from origin remote (HTTPS)', () => {
    (spawnSync as any).mockImplementation((cmd: string, args: string[]) => {
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
    (spawnSync as any).mockImplementation((cmd: string, args: string[]) => {
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
    (spawnSync as any).mockImplementation((cmd: string, args: string[]) => {
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
    (spawnSync as any).mockReturnValue({ status: 1 } as any);
    const name = detectRepoName();
    expect(name).toBe('gemini-cli');
  });
});

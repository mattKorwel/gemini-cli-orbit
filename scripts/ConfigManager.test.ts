/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { loadSettings, detectRepoName } from './ConfigManager.ts';

vi.mock('node:fs');
vi.mock('node:child_process', () => ({
    spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: Buffer.from('{"name": "test-repo"}') })
}));

describe('ConfigManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should migrate legacy settings', () => {
    const legacySettings = {
      workspace: {
        projectId: 'legacy-p',
        repoName: 'legacy-r',
        instanceName: 'legacy-i'
      }
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(legacySettings));
    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    const settings = loadSettings();
    expect(settings.repos['legacy-r']).toBeDefined();
    expect(settings.repos['legacy-r'].projectId).toBe('legacy-p');
    expect(settings.activeRepo).toBe('legacy-r');
    expect(writeSpy).toHaveBeenCalled();
  });

  it('should load new settings format', () => {
    const newSettings = {
      repos: {
        'repo-a': { projectId: 'p-a', instanceName: 'i-a' }
      },
      activeRepo: 'repo-a'
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(newSettings));

    const settings = loadSettings();
    expect(settings.repos['repo-a']).toBeDefined();
    expect(settings.repos['repo-a'].projectId).toBe('p-a');
  });

  it('should detect repo name', () => {
    const name = detectRepoName();
    expect(name).toBe('test-repo');
  });
});

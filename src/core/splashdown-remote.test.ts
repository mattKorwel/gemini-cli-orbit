/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSplashdown } from './splashdown.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import * as ConfigManager from './ConfigManager.js';

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readdirSync: vi.fn().mockReturnValue(['prod-station.json']),
    mkdirSync: vi.fn(),
    createWriteStream: vi
      .fn()
      .mockReturnValue({ write: vi.fn(), end: vi.fn() }),
    appendFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  readdirSync: vi.fn().mockReturnValue(['prod-station.json']),
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn().mockReturnValue({ write: vi.fn(), end: vi.fn() }),
  appendFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('./providers/ProviderFactory.ts');
vi.mock('./ConfigManager.ts', () => ({
  detectRepoName: vi.fn().mockReturnValue('gemini-orbit-extension'),
  getRepoConfig: vi.fn().mockReturnValue({
    projectId: 'remote-project',
    zone: 'us-central1-a',
    instanceName: 'prod-station',
    repoName: 'gemini-orbit-extension',
  }),
  loadSettings: vi
    .fn()
    .mockReturnValue({ activeStation: 'prod-station', repos: {} }),
  saveSettings: vi.fn(),
  loadSchematic: vi.fn().mockReturnValue({}),
  loadJson: vi.fn().mockReturnValue({
    name: 'prod-station',
    instanceName: 'prod-station',
    type: 'gce',
    projectId: 'remote-project',
    zone: 'us-central1-a',
  }),
  sanitizeName: (n: string) => n.replace(/[^a-z0-9]/g, '-').toLowerCase(),
}));

describe('runSplashdown (Remote Mode)', () => {
  const mockProvider = {
    exec: vi.fn().mockResolvedValue(0),
    stop: vi.fn().mockResolvedValue(0),
    destroy: vi.fn().mockResolvedValue(0),
    stopCapsule: vi.fn().mockResolvedValue(0),
    removeCapsule: vi.fn().mockResolvedValue(0),
    listCapsules: vi.fn().mockResolvedValue(['orbit-23176-open']),
    getExecOutput: vi
      .fn()
      .mockResolvedValue({ status: 0, stdout: 'orbit-23176-open', stderr: '' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(ProviderFactory, 'getProvider').mockReturnValue(
      mockProvider as any,
    );

    (ConfigManager.detectRepoName as any).mockReturnValue(
      'gemini-orbit-extension',
    );
    (ConfigManager.getRepoConfig as any).mockReturnValue({
      projectId: 'remote-project',
      zone: 'us-central1-a',
      instanceName: 'prod-station',
      repoName: 'gemini-orbit-extension',
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should call destroy() when --all is present in remote mode', async () => {
    // Need to mock readline to confirm
    vi.mock('node:readline', () => ({
      default: {
        createInterface: vi.fn().mockReturnValue({
          question: vi.fn().mockImplementation((_q, cb) => cb('y')),
          close: vi.fn(),
        }),
      },
    }));

    const res = await runSplashdown(['--all']);

    expect(res).toBe(0);
    expect(mockProvider.destroy).toHaveBeenCalled();
  });
});

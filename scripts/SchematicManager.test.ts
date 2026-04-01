/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchematicManager } from './SchematicManager.js';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as ConfigManager from './ConfigManager.js';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('./ConfigManager.js');

describe('SchematicManager', () => {
  let manager: SchematicManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SchematicManager();
    vi.mocked(ConfigManager.sanitizeName).mockImplementation((n) =>
      n.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    );
  });

  it('should list available schematics', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      'corp.json',
      'sandbox.json',
    ] as any);

    const schematics = manager.listSchematics();
    expect(schematics).toEqual(['corp', 'sandbox']);
  });

  it('should import a local schematic file', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        projectId: 'test-p',
        zone: 'us-central1-a',
        backendType: 'external',
      }),
    );

    const name = await manager.importSchematic('./test.json');
    expect(name).toBe('test');
    expect(ConfigManager.saveSchematic).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ projectId: 'test-p' }),
    );
  });

  it('should import a remote schematic via curl', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: Buffer.from(
        JSON.stringify({
          profileName: 'remote-corp',
          projectId: 'remote-p',
          zone: 'us-central1-b',
          backendType: 'direct-internal',
        }),
      ),
    } as any);

    const name = await manager.importSchematic('https://example.com/corp.json');
    expect(name).toBe('remote-corp');
    expect(spawnSync).toHaveBeenCalledWith(
      'curl',
      expect.arrayContaining(['-sL', 'https://example.com/corp.json']),
      expect.any(Object),
    );
    expect(ConfigManager.saveSchematic).toHaveBeenCalledWith(
      'remote-corp',
      expect.objectContaining({ projectId: 'remote-p' }),
    );
  });

  it('should throw error on invalid JSON import', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('invalid-json');

    await expect(manager.importSchematic('./bad.json')).rejects.toThrow(
      'Invalid JSON schematic',
    );
  });

  it('should perform headless update when configuration flags are provided', async () => {
    vi.mocked(ConfigManager.loadJson).mockReturnValue({
      projectId: 'old-project',
      vpcName: 'old-vpc',
    });
    vi.mocked(ConfigManager.parseFlags).mockReturnValue({
      projectId: 'new-project',
    });

    await manager.runWizard('test-schematic');

    // Should NOT call any UI (mocked by vitest as no-ops or throwing if not careful)
    // but SHOULD save the merged config
    expect(ConfigManager.saveSchematic).toHaveBeenCalledWith(
      'test-schematic',
      expect.objectContaining({
        projectId: 'new-project',
        vpcName: 'old-vpc',
      }),
    );
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchematicManager } from './SchematicManager.js';
import { SCHEMATICS_DIR } from './Constants.js';
import * as ConfigManager from './ConfigManager.js';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('./ConfigManager.js');
vi.mock('./Logger.js');

describe('SchematicManager', () => {
  let manager: SchematicManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SchematicManager();
    (ConfigManager.sanitizeName as any).mockImplementation((n: string) =>
      n.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    );
  });

  it('should list available schematics', () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readdirSync as any).mockReturnValue([
      'corp.json',
      'personal.json',
      'README.md',
    ] as any);

    const list = manager.listSchematics();
    expect(list).toContain('corp');
    expect(list).toContain('personal');
    expect(list).not.toContain('README');
  });

  it('should import a remote schematic via curl', async () => {
    const mockJson = JSON.stringify({
      projectId: 'remote-p',
      zone: 'remote-z',
      backendType: 'external',
    });

    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: Buffer.from(mockJson),
    } as any);

    const name = await manager.importSchematic('https://example.com/corp.json');
    expect(name).toBe('corp');
    expect(ConfigManager.saveSchematic).toHaveBeenCalledWith(
      'corp',
      expect.objectContaining({ projectId: 'remote-p' }),
    );
  });

  it('should fail validation on invalid schematic import', async () => {
    const mockJson = JSON.stringify({
      projectId: 'missing-fields',
    });

    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: Buffer.from(mockJson),
    } as any);

    await expect(
      manager.importSchematic('https://example.com/invalid.json'),
    ).rejects.toThrow(/missing required infrastructure fields/);
  });

  it('should fail on invalid JSON import', async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue('invalid-json');

    await expect(manager.importSchematic('./local.json')).rejects.toThrow(
      /Invalid JSON schematic/,
    );
  });

  it('should perform headless update when configuration flags are provided', async () => {
    (ConfigManager.loadJson as any).mockReturnValue({
      projectId: 'old-project',
      vpcName: 'old-vpc',
    });

    const cliFlags = {
      projectId: 'new-project',
    };

    await manager.runWizard('test-schematic', cliFlags);

    // Should NOT call any UI but SHOULD save the merged config
    expect(ConfigManager.saveSchematic).toHaveBeenCalledWith(
      'test-schematic',
      expect.objectContaining({
        projectId: 'new-project',
        vpcName: 'old-vpc',
      }),
    );
  });
});

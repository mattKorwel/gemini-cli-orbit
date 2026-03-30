/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DesignManager } from './DesignManager.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as ConfigManager from './ConfigManager.js';

vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('./ConfigManager.js');

describe('DesignManager', () => {
  let manager: DesignManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new DesignManager();
  });

  it('should list available designs', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      'corp.json',
      'sandbox.json',
    ] as any);

    const designs = manager.listDesigns();
    expect(designs).toEqual(['corp', 'sandbox']);
  });

  it('should import a local design file', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ projectId: 'test-p' }),
    );

    const name = await manager.importDesign('./test.json');
    expect(name).toBe('test');
    expect(ConfigManager.saveProfile).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ projectId: 'test-p' }),
    );
  });

  it('should import a remote design via curl', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: Buffer.from(
        JSON.stringify({ profileName: 'remote-corp', projectId: 'remote-p' }),
      ),
    } as any);

    const name = await manager.importDesign('https://example.com/corp.json');
    expect(name).toBe('remote-corp');
    expect(spawnSync).toHaveBeenCalledWith(
      'curl',
      expect.arrayContaining(['-sL', 'https://example.com/corp.json']),
      expect.any(Object),
    );
    expect(ConfigManager.saveProfile).toHaveBeenCalledWith(
      'remote-corp',
      expect.objectContaining({ projectId: 'remote-p' }),
    );
  });

  it('should throw error on invalid JSON import', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('invalid-json');

    await expect(manager.importDesign('./bad.json')).rejects.toThrow(
      'Invalid JSON design',
    );
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { getMissionManifest } from '../utils/MissionUtils.js';
import {
  CAPSULE_MANIFEST_PATH,
  LOCAL_MANIFEST_NAME,
  LOCAL_MANIFEST_ENV,
} from '../core/Constants.js';

vi.mock('node:fs');

describe('Mission Manifest Loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads from local manifest if it exists', () => {
    const mockManifest = { identifier: 'local-test' };
    (fs.existsSync as any).mockImplementation((p: string) =>
      p.endsWith(LOCAL_MANIFEST_NAME),
    );
    (fs.readFileSync as any).mockReturnValue(JSON.stringify(mockManifest));

    const result = getMissionManifest();
    expect(result.identifier).toBe('local-test');
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining(LOCAL_MANIFEST_NAME),
      'utf8',
    );
  });

  it('loads from global capsule manifest if local does not exist', () => {
    const mockManifest = { identifier: 'capsule-test' };
    (fs.existsSync as any).mockImplementation(
      (p: string) => p === CAPSULE_MANIFEST_PATH,
    );
    (fs.readFileSync as any).mockReturnValue(JSON.stringify(mockManifest));

    const result = getMissionManifest();
    expect(result.identifier).toBe('capsule-test');
    expect(fs.readFileSync).toHaveBeenCalledWith(CAPSULE_MANIFEST_PATH, 'utf8');
  });

  it('prioritizes local over global manifest', () => {
    const originalEnv = process.env[LOCAL_MANIFEST_ENV];
    process.env[LOCAL_MANIFEST_ENV] = '/tmp/local-manifest.json';
    try {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockImplementation((p: string) => {
        if (p === '/tmp/local-manifest.json')
          return JSON.stringify({ identifier: 'local' });
        return JSON.stringify({ identifier: 'global' });
      });

      const result = getMissionManifest();
      expect(result.identifier).toBe('local');
    } finally {
      if (originalEnv) process.env[LOCAL_MANIFEST_ENV] = originalEnv;
      else delete process.env[LOCAL_MANIFEST_ENV];
    }
  });

  it('throws error if no manifest is found anywhere', () => {
    (fs.existsSync as any).mockReturnValue(false);
    expect(() => getMissionManifest()).toThrow('Mission manifest not found');
  });

  it('throws helpful error on parse failure', () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue('invalid-json');
    expect(() => getMissionManifest()).toThrow('Failed to parse');
  });
});

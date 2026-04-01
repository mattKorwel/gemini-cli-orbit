/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TempManager } from './TempManager.js';

describe('TempManager', () => {
  const mockHomedir = path.join(os.tmpdir(), 'gemini-orbit-test-home');

  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(mockHomedir);
    if (fs.existsSync(mockHomedir)) {
      fs.rmSync(mockHomedir, { recursive: true, force: true });
    }
    fs.mkdirSync(mockHomedir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(mockHomedir, { recursive: true, force: true });
  });

  it('uses default path if none provided', () => {
    const tm = new TempManager({});
    const sessionId = 'test-session';
    const dir = tm.getDir(sessionId);

    expect(dir).toContain(sessionId);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('respects custom tempDir in config', () => {
    const customDir = path.join(mockHomedir, 'custom-tmp');
    const tm = new TempManager({ tempDir: customDir });
    const sessionId = 'test-session';
    const dir = tm.getDir(sessionId);

    expect(dir).toBe(path.join(customDir, sessionId));
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('respects environment variable for tempDir', () => {
    const envDir = path.join(mockHomedir, 'env-tmp');
    vi.stubEnv('GCLI_ORBIT_TEMP_DIR', envDir);

    const tm = new TempManager({});
    const sessionId = 'test-session';
    const dir = tm.getDir(sessionId);

    expect(dir).toBe(path.join(envDir, sessionId));
    vi.stubEnv('GCLI_ORBIT_TEMP_DIR', undefined!);
  });

  it('cleans up directory if autoClean is true', () => {
    const tm = new TempManager({ autoClean: true });
    const sessionId = 'clean-me';
    const dir = tm.getDir(sessionId);
    fs.writeFileSync(path.join(dir, 'file.txt'), 'hello');

    expect(fs.existsSync(dir)).toBe(true);
    tm.cleanup(sessionId);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('does NOT clean up if autoClean is false', () => {
    const tm = new TempManager({ autoClean: false });
    const sessionId = 'keep-me';
    const dir = tm.getDir(sessionId);

    tm.cleanup(sessionId);
    expect(fs.existsSync(dir)).toBe(true);
  });
});

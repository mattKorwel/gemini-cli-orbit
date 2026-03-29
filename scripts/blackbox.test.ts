/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runBlackbox } from './blackbox.js';
import fs from 'node:fs';
import { DEFAULT_TEMP_DIR } from './Constants.js';

vi.mock('node:fs');

describe('runBlackbox', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('fails if no PR number provided', async () => {
    const res = await runBlackbox([]);
    expect(res).toBe(1);
  });

  it('fails if temp dir does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const res = await runBlackbox(['123']);
    expect(res).toBe(1);
  });

  it('shows logs if local directory exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValueOnce([
      'orbit-123-review-1',
    ] as any);
    vi.mocked(fs.statSync).mockReturnValue({
      mtime: { getTime: () => 100 },
    } as any);
    vi.mocked(fs.readdirSync).mockReturnValueOnce(['test.log'] as any);

    const res = await runBlackbox(['123', 'review']);
    expect(res).toBe(0);
  });
});

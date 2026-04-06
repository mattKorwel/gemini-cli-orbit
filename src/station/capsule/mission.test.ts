/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main } from './mission.js';
import { logger } from '../../core/Logger.js';
import * as MissionUtils from '../../utils/MissionUtils.js';
import fs from 'node:fs';

vi.mock('../../core/Logger.js', () => ({
  logger: {
    divider: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    setVerbose: vi.fn(),
  },
}));

vi.mock('../../utils/MissionUtils.js', () => ({
  getManifestFromEnv: vi.fn(),
}));

vi.mock('../../core/ConfigManager.js', () => ({
  getRepoConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../../utils/TempManager.js', () => ({
  TempManager: vi.fn().mockImplementation(() => ({
    getDir: vi.fn().mockReturnValue('/tmp/logs'),
  })),
}));

vi.mock('node:fs');

describe('mission entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should hydrate logger verbosity from manifest', async () => {
    (MissionUtils.getManifestFromEnv as any).mockReturnValue({
      identifier: '123',
      action: 'review',
      workDir: '/test/dir',
      policyPath: '/test/policy',
      verbose: true,
    });
    (fs.existsSync as any).mockReturnValue(true);

    // We expect it to fail further down because we haven't mocked everything,
    // but setVerbose should be called early.
    try {
      await main();
    } catch (e) {}

    expect(logger.setVerbose).toHaveBeenCalledWith(true);
  });
});

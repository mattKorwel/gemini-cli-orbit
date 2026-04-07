/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  SessionManager: {
    getSessionIdFromEnv: vi.fn().mockReturnValue(null),
    generateMissionId: vi.fn().mockReturnValue('mock-session'),
  },
}));

// Mock GitExecutor properly as a class-like object if needed,
// or just spy on the static method
vi.mock('../../core/executors/GitExecutor.js', () => ({
  GitExecutor: {
    revParse: vi
      .fn()
      .mockReturnValue({ bin: 'git', args: ['rev-parse'], options: {} }),
  },
}));

vi.mock('../../core/ConfigManager.js', () => ({
  getRepoConfig: vi.fn().mockReturnValue({}),
  sanitizeName: vi.fn((n: string) =>
    n.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase(),
  ),
}));

vi.mock('../../utils/TempManager.js', () => ({
  TempManager: vi.fn().mockImplementation(() => ({
    getDir: vi.fn().mockReturnValue('/tmp/logs'),
  })),
}));

// Mock playbooks
vi.mock('../../playbooks/review.js', () => ({
  runReviewPlaybook: vi.fn().mockResolvedValue(0),
}));
vi.mock('../../playbooks/fix.js', () => ({
  runFixPlaybook: vi.fn().mockResolvedValue(0),
}));

vi.mock('node:fs');

describe('mission entrypoint', () => {
  let mockPm: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPm = {
      runSync: vi.fn().mockReturnValue({ status: 0 }),
    };
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

    await main(mockPm);

    expect(logger.setVerbose).toHaveBeenCalledWith(true);
  });

  it('should dispatch to review playbook', async () => {
    (MissionUtils.getManifestFromEnv as any).mockReturnValue({
      identifier: '123',
      action: 'review',
      workDir: '/test/dir',
      policyPath: '/test/policy',
    });
    (fs.existsSync as any).mockReturnValue(true);

    const { runReviewPlaybook } = await import('../../playbooks/review.js');

    await main(mockPm);

    expect(runReviewPlaybook).toHaveBeenCalledWith(
      '123',
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      mockPm,
    );
  });
});

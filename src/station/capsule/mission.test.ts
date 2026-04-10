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
  getMissionManifest: vi.fn(),
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
    (MissionUtils.getMissionManifest as any).mockReturnValue({
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
    (MissionUtils.getMissionManifest as any).mockReturnValue({
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

  it('should launch chat with the capsule gemini binary and interactive cwd', async () => {
    (MissionUtils.getMissionManifest as any).mockReturnValue({
      identifier: 'chat-123',
      action: 'chat',
      workDir: '/orbit/workspaces/test-repo/chat-123',
      policyPath: '/orbit/.gemini/policies/workspace-policy.toml',
    });
    (fs.existsSync as any).mockImplementation((target: string) => {
      return target === '/usr/local/share/npm-global/bin/gemini';
    });
    (fs.readdirSync as any).mockReturnValue([]);
    mockPm.runSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });

    await main(mockPm);

    const [bin, args, options] = mockPm.runSync.mock.calls[0];
    expect(bin).toBe('/usr/local/share/npm-global/bin/gemini');
    expect(args).toEqual([
      '--approval-mode',
      'plan',
      '--policy',
      '/orbit/.gemini/policies/workspace-policy.toml',
    ]);
    expect(options).toEqual(
      expect.objectContaining({
        interactive: true,
        env: expect.objectContaining({
          GEMINI_AUTO_UPDATE: '0',
          GCLI_ORBIT_MISSION_ID: 'chat-123',
          GCLI_ORBIT_ACTION: 'chat',
          GCLI_TRUST: '1',
        }),
      }),
    );
    expect(String(options.cwd).replaceAll('\\', '/')).toContain(
      '/orbit/workspaces/test-repo/chat-123',
    );
  });
});

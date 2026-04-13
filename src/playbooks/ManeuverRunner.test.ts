/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgenticManeuver } from './ManeuverRunner.js';
import { logger } from '../core/Logger.js';
import fs from 'node:fs';

vi.mock('../core/Logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('node:fs');

describe('ManeuverRunner', () => {
  let mockPm: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPm = {
      runSync: vi.fn().mockReturnValue({ status: 0 }),
    };
  });

  it('should run pre-flight context and then gemini', async () => {
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue('mock protocol');

    const options = {
      identifier: '123',
      action: 'review',
      targetDir: '/test/dir',
      policyPath: '/test/policy',
      logDir: '/test/logs',
      pm: mockPm,
      protocolName: 'reviewer',
    };

    const status = await runAgenticManeuver(options);

    expect(status).toBe(0);
    // Check context acquisition
    expect(mockPm.runSync).toHaveBeenCalledWith(
      'sh',
      ['-c', expect.stringContaining('fetch-mission-context.js')],
      expect.objectContaining({ cwd: '/test/dir' }),
    );

    // Check gemini execution
    expect(mockPm.runSync).toHaveBeenCalledWith(
      'gemini',
      expect.arrayContaining([
        '--approval-mode',
        'plan',
        '--policy',
        '/test/policy',
        '--prompt',
        expect.stringContaining('mock protocol'),
      ]),
      expect.objectContaining({
        env: expect.objectContaining({
          GCLI_ORBIT_MISSION_ID: '123',
          GCLI_ORBIT_ACTION: 'review',
        }),
      }),
    );
  });

  it('should handle missing protocol prompt', async () => {
    (fs.existsSync as any).mockReturnValue(false);

    const options = {
      identifier: '456',
      action: 'fix',
      targetDir: '/test/dir',
      policyPath: '/test/policy',
      logDir: '/test/logs',
      pm: mockPm,
      protocolName: 'unknown',
    };

    await runAgenticManeuver(options);

    expect(logger.warn).toHaveBeenCalledWith(
      'GENERAL',
      expect.stringContaining('Protocol prompt not found'),
    );
    expect(mockPm.runSync).toHaveBeenLastCalledWith(
      'gemini',
      expect.arrayContaining([
        '--prompt',
        expect.stringContaining('Perform a fix mission'),
      ]),
      expect.any(Object),
    );
  });
});

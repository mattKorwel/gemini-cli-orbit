/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main } from './station.js';
import { StationSupervisor } from './StationSupervisor.js';
import { StatusAggregator } from './StatusAggregator.js';
import { logger } from '../core/Logger.js';

vi.mock('./StationSupervisor.js');
vi.mock('./StatusAggregator.js');

const mockManifest = {
  identifier: '123',
  repoName: 'test-repo',
  branchName: 'feat-test',
  action: 'review',
  workDir: '/test/dir',
  policyPath: '/test/policy',
  sessionName: 'orbit/test/id',
  upstreamUrl: 'https://github.com/org/repo.git',
};

describe('worker main', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('GCLI_ORBIT_MANIFEST', JSON.stringify(mockManifest));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should dispatch to aggregator on status command', async () => {
    const mockAggregator = {
      getStatus: vi.fn().mockResolvedValue({ missions: [] }),
    };
    (StatusAggregator as any).mockImplementation(() => mockAggregator);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await main(['status']);
    expect(mockAggregator.getStatus).toHaveBeenCalled();
  });

  it('should dispatch to station manager on setup-hooks command', async () => {
    const mockStation = {
      setupHooks: vi.fn().mockResolvedValue(0),
    };
    (StationSupervisor as any).mockImplementation(() => mockStation);

    await main(['setup-hooks']);
    expect(mockStation.setupHooks).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: '123' }),
    );
  });

  it('should dispatch to station manager on init command', async () => {
    const mockStation = {
      initGit: vi.fn().mockResolvedValue(0),
    };
    (StationSupervisor as any).mockImplementation(() => mockStation);

    await main(['init']);
    expect(mockStation.initGit).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: '123' }),
    );
  });

  it('should dispatch to station supervisor on run command', async () => {
    const mockStation = {
      runMission: vi.fn().mockResolvedValue(0),
    };
    (StationSupervisor as any).mockImplementation(() => mockStation);

    await main(['run']);
    expect(mockStation.runMission).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: '123' }),
    );
  });

  it('should hydrate logger verbosity from manifest', async () => {
    vi.stubEnv(
      'GCLI_ORBIT_MANIFEST',
      JSON.stringify({ ...mockManifest, verbose: true }),
    );
    const mockStation = { start: vi.fn().mockResolvedValue(0) };
    (StationSupervisor as any).mockImplementation(() => mockStation);

    const setVerboseSpy = vi.spyOn(logger, 'setVerbose');

    await main(['start']);

    expect(setVerboseSpy).toHaveBeenCalledWith(true);
  });
});

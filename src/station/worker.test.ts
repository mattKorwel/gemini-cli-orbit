/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { main } from './worker.js';
import { StationSupervisor } from './StationSupervisor.js';
import { StatusAggregator } from './StatusAggregator.js';

vi.mock('./StationSupervisor.js');
vi.mock('./StatusAggregator.js');

describe('worker main', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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

    await main(['setup-hooks', '/test/dir']);
    expect(mockStation.setupHooks).toHaveBeenCalledWith('/test/dir');
  });

  it('should dispatch to station manager on init command', async () => {
    const mockStation = {
      initGit: vi.fn().mockResolvedValue(0),
    };
    (StationSupervisor as any).mockImplementation(() => mockStation);

    await main([
      'init',
      '/test/dir',
      '123',
      'feat-test',
      'https://github.com/org/repo.git',
    ]);
    expect(mockStation.initGit).toHaveBeenCalledWith(
      '/test/dir',
      'https://github.com/org/repo.git',
      'feat-test',
      undefined,
    );
  });

  it('should dispatch to station supervisor on run command', async () => {
    const mockStation = {
      runMission: vi.fn().mockResolvedValue(0),
    };
    (StationSupervisor as any).mockImplementation(() => mockStation);

    await main([
      'run',
      '123',
      'feat-test',
      'chat',
      '/work',
      '/policy',
      'orbit/repo/123',
    ]);
    expect(mockStation.runMission).toHaveBeenCalledWith(
      '123',
      'feat-test',
      'chat',
      '/work',
      '/policy',
      'orbit/repo/123',
    );
  });

  it('should dispatch to station supervisor on run-internal command', async () => {
    const mockStation = {
      runPlaybook: vi.fn().mockResolvedValue(0),
    };
    (StationSupervisor as any).mockImplementation(() => mockStation);

    await main([
      'run-internal',
      '123',
      'feat-test',
      'fix',
      '/work',
      '/policy',
      'orbit/repo/123',
    ]);
    expect(mockStation.runPlaybook).toHaveBeenCalledWith(
      '123',
      'feat-test',
      'fix',
      '/work',
      '/policy',
      'orbit/repo/123',
    );
  });
});

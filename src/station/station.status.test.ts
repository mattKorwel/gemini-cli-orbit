/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// DO NOT MOCK CONSTANTS GLOBALLY
import { main } from './station.js';
import { ORBIT_STATE_PATH } from '../core/Constants.js';

vi.mock('./BlueprintHydrator.js', () => ({
  hydrateStationSupervisorConfig: vi.fn().mockReturnValue({
    port: 8080,
    hostRoot: '/tmp',
    storage: { workspacesRoot: '/tmp/workspaces', mirrorPath: '/tmp/main' },
    mounts: [],
    areas: {},
  }),
}));

describe('Worker Status Aggregator', () => {
  let workspacesDir: string;

  beforeEach(() => {
    workspacesDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'orbit-workspaces-test-'),
    );

    process.env.ORBIT_HOST_ROOT = '/tmp';
    process.env.GCLI_ORBIT_HOST_PATH_BASE = '/tmp';

    // Mock console.log to capture output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(workspacesDir, { recursive: true, force: true });
    delete process.env.ORBIT_HOST_ROOT;
    delete process.env.GCLI_ORBIT_HOST_PATH_BASE;
    vi.restoreAllMocks();
  });

  it('aggregates state from multiple mission workspaces', async () => {
    const repo1 = path.join(workspacesDir, 'repo-a');
    const mission1 = path.join(repo1, 'mission-1');
    const mission2 = path.join(repo1, 'mission-2');

    fs.mkdirSync(mission1, { recursive: true });
    fs.mkdirSync(mission2, { recursive: true });

    const state1 = {
      status: 'THINKING',
      last_thought: 'Working on it...',
      mission: 'mission-1',
    };
    const state2 = {
      status: 'WAITING_FOR_INPUT',
      last_question: 'Ready?',
      mission: 'mission-2',
    };

    fs.mkdirSync(path.dirname(path.join(mission1, ORBIT_STATE_PATH)), {
      recursive: true,
    });
    fs.mkdirSync(path.dirname(path.join(mission2, ORBIT_STATE_PATH)), {
      recursive: true,
    });

    fs.writeFileSync(
      path.join(mission1, ORBIT_STATE_PATH),
      JSON.stringify(state1),
    );
    fs.writeFileSync(
      path.join(mission2, ORBIT_STATE_PATH),
      JSON.stringify(state2),
    );

    await main(['status', workspacesDir]);

    const output = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(output.missions).toHaveLength(2);
    expect(
      output.missions.find((m: any) => m.mission === 'mission-1').status,
    ).toBe('THINKING');
  });

  it('returns empty list if no workspaces exist', async () => {
    await main(['status', workspacesDir]);
    const output = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(output.missions).toEqual([]);
  });

  it('aggregates state from an explicit path provided via CLI', async () => {
    const customDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'orbit-custom-pulse-'),
    );

    const repoDir = path.join(customDir, 'repo-x');
    const missionDir = path.join(repoDir, 'mission-x');
    fs.mkdirSync(missionDir, { recursive: true });

    const stateFile = path.join(missionDir, ORBIT_STATE_PATH);
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        status: 'COMPLETED',
        mission: 'mission-x',
      }),
    );

    await main(['status', customDir]);

    const output = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(output.missions).toHaveLength(1);
    expect(output.missions[0].status).toBe('COMPLETED');
    expect(output.missions[0].repo).toBe('repo-x');

    fs.rmSync(customDir, { recursive: true, force: true });
  });
});

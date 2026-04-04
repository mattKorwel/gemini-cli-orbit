/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// We mock SATELLITE_WORKSPACES_PATH in Constants
vi.mock('../core/Constants.js', async (importOriginal) => {
  const original = await importOriginal<any>();
  return {
    ...original,
    SATELLITE_WORKSPACES_PATH: path.join(os.tmpdir(), 'orbit-workspaces-test'),
  };
});

import { main } from './worker.js';
import {
  SATELLITE_WORKSPACES_PATH,
  ORBIT_STATE_PATH,
} from '../core/Constants.js';

describe('Worker Status Aggregator', () => {
  let workspacesDir: string;

  beforeEach(() => {
    workspacesDir = SATELLITE_WORKSPACES_PATH;
    if (fs.existsSync(workspacesDir)) {
      fs.rmSync(workspacesDir, { recursive: true, force: true });
    }
    fs.mkdirSync(workspacesDir, { recursive: true });

    // Mock console.log to capture output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(workspacesDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('aggregates state from multiple mission workspaces', async () => {
    // Setup mock workspaces
    const repo1 = path.join(workspacesDir, 'repo-a');
    const mission1 = path.join(repo1, 'mission-1');
    const mission2 = path.join(repo1, 'mission-2');

    fs.mkdirSync(mission1, { recursive: true });
    fs.mkdirSync(mission2, { recursive: true });

    const state1 = { status: 'THINKING', last_thought: 'Working on it...' };
    const state2 = { status: 'WAITING_FOR_INPUT', last_question: 'Ready?' };

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

    await main(['status']);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"status": "THINKING"'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"status": "WAITING_FOR_INPUT"'),
    );

    const output = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(output.missions).toHaveLength(2);
    expect(
      output.missions.find((m: any) => m.mission === 'mission-1').status,
    ).toBe('THINKING');
  });

  it('returns empty list if no workspaces exist', async () => {
    await main(['status']);
    const output = JSON.parse((console.log as any).mock.calls[0][0]);
    expect(output.missions).toEqual([]);
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as hooks from './hooks.js';

describe('Mission Control Hooks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-hooks-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('beforeAgent sets state to THINKING', async () => {
    await hooks.beforeAgent({ cwd: tmpDir });
    const state = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.gemini/orbit/state.json'), 'utf8'),
    );
    expect(state.status).toBe('THINKING');
  });

  it('afterAgent sets state to IDLE or WAITING_FOR_INPUT', async () => {
    // Waiting for input
    await hooks.afterAgent({
      cwd: tmpDir,
      prompt_response: 'What is your favorite color?',
      stop_hook_active: false,
    });
    let state = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.gemini/orbit/state.json'), 'utf8'),
    );
    expect(state.status).toBe('WAITING_FOR_INPUT');
    expect(state.last_question).toBe('What is your favorite color?');

    // Idle
    await hooks.afterAgent({
      cwd: tmpDir,
      prompt_response: 'Task complete.',
      stop_hook_active: true,
    });
    state = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.gemini/orbit/state.json'), 'utf8'),
    );
    expect(state.status).toBe('IDLE');
    expect(state.last_thought).toBe('Task complete.');
  });

  it('notification sets WAITING_FOR_APPROVAL if type is ToolPermission', async () => {
    await hooks.notification({
      cwd: tmpDir,
      notification_type: 'ToolPermission',
      message: 'May I run replace?',
      details: { tool_name: 'replace' },
    });
    const state = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.gemini/orbit/state.json'), 'utf8'),
    );
    expect(state.status).toBe('WAITING_FOR_APPROVAL');
    expect(state.pending_tool).toBe('replace');
    expect(state.blocker).toBe('May I run replace?');
  });

  it('beforeTool sets state back to THINKING', async () => {
    await hooks.beforeTool({ cwd: tmpDir });
    const state = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.gemini/orbit/state.json'), 'utf8'),
    );
    expect(state.status).toBe('THINKING');
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ORBIT_STATE_PATH = '.gemini/orbit/state.json';

export interface OrbitState {
  status:
    | 'INITIALIZING'
    | 'THINKING'
    | 'IDLE'
    | 'WAITING_FOR_INPUT'
    | 'WAITING_FOR_APPROVAL'
    | 'COMPLETED';
  last_thought?: string;
  blocker?: string;
  progress?: string;
  pending_tool?: string;
  last_question?: string;
  timestamp: string;
  mission?: string;
}

export function updateState(targetDir: string, patch: Partial<OrbitState>) {
  const stateFile = path.join(targetDir, ORBIT_STATE_PATH);
  const dir = path.dirname(stateFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let current: OrbitState = {
    status: 'IDLE',
    timestamp: new Date().toISOString(),
  };
  if (fs.existsSync(stateFile)) {
    try {
      current = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch {}
  }

  const updated = { ...current, ...patch, timestamp: new Date().toISOString() };
  fs.writeFileSync(stateFile, JSON.stringify(updated, null, 2));
}

/**
 * Hook triggered BEFORE the agent starts its turn.
 */
export async function beforeAgent(input: any) {
  updateState(input.cwd, { status: 'THINKING' });
}

/**
 * Hook triggered when a Gemini session starts.
 */
export async function sessionStart(input: any) {
  updateState(input.cwd, {
    status: 'IDLE',
    ...(process.env.GCLI_ORBIT_MISSION_ID
      ? { mission: process.env.GCLI_ORBIT_MISSION_ID }
      : {}),
  });
}

/**
 * Hook triggered AFTER the agent finishes its turn.
 */
export async function afterAgent(input: any) {
  const response = input.prompt_response || '';

  // Improved detection: Check for explicit flag OR prompt patterns
  const isWaitingForInput =
    input.is_waiting_for_input === true ||
    (!input.stop_hook_active &&
      (response.trim().endsWith('?') ||
        response.includes('(y/n)') ||
        response.includes('Allow execution')));

  updateState(input.cwd, {
    status: isWaitingForInput ? 'WAITING_FOR_INPUT' : 'IDLE',
    last_thought: response.slice(0, 200),
    last_question: isWaitingForInput ? response.slice(0, 200) : undefined,
  });
}

/**
 * Hook triggered when the CLI needs to notify the user (e.g., tool permission).
 */
export async function notification(input: any) {
  if (input.notification_type === 'ToolPermission') {
    updateState(input.cwd, {
      status: 'WAITING_FOR_APPROVAL',
      pending_tool: input.details?.tool_name,
      blocker:
        input.message ||
        `Waiting for approval of tool: ${input.details?.tool_name}`,
    });
  }
}

/**
 * Hook triggered BEFORE a tool is executed.
 */
export async function beforeTool(input: any) {
  // Clear any previous approval blocker when a tool starts
  // (though AfterTool or AfterAgent might also do this)
  updateState(input.cwd, { status: 'THINKING' });
}

export function isDirectHookExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;

  try {
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

export async function runHookCli() {
  try {
    const stdin = fs.readFileSync(0, 'utf8').trim();
    if (!stdin) {
      return 0;
    }

    const input = JSON.parse(stdin);
    const event = input.hook_event_name || input.event || '';

    switch (event) {
      case 'SessionStart':
        await sessionStart(input);
        break;
      case 'BeforeAgent':
        await beforeAgent(input);
        break;
      case 'AfterAgent':
        await afterAgent(input);
        break;
      case 'BeforeTool':
        await beforeTool(input);
        break;
      case 'Notification':
        await notification(input);
        break;
    }

    return 0;
  } catch {
    return 0;
  }
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

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

// Entry point for command-line hooks
if (
  import.meta.url === `file://${process.argv[1]}` ||
  (process.argv[1] && process.argv[1].endsWith('hooks.js'))
) {
  try {
    const stdin = fs.readFileSync(0, 'utf8').trim();
    if (!stdin) {
      process.exit(0);
    }

    const input = JSON.parse(stdin);
    const event = input.hook_event_name || input.event || '';

    switch (event) {
      case 'SessionStart':
        sessionStart(input);
        break;
      case 'BeforeAgent':
        beforeAgent(input);
        break;
      case 'AfterAgent':
        afterAgent(input);
        break;
      case 'BeforeTool':
        beforeTool(input);
        break;
      case 'Notification':
        notification(input);
        break;
    }
  } catch (_e) {
    process.exit(0);
  }
}

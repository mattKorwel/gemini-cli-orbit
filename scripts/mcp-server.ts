/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { runOrchestrator } from './orchestrator.js';
import { runStatus } from './status.js';
import { runJettison } from './jettison.js';
import { runReap } from './reap.js';
import { runSetup } from './setup.js';
import { runSplashdown } from './splashdown.js';
import { runCI } from './ci.js';
import { runUplink } from './uplink.js';
import { runBlackbox } from './blackbox.js';
import { runFleet } from './fleet.js';

// --- OUTPUT CAPTURE HELPER ---
class OutputCapturer {
  private originalLog = console.log;
  private originalError = console.error;
  private originalWarn = console.warn;
  private buffer: string[] = [];

  start() {
    this.buffer = [];
    console.log = (...args: any[]) => this.buffer.push(args.join(' '));
    console.error = (...args: any[]) =>
      this.buffer.push(`[ERROR] ${args.join(' ')}`);
    console.warn = (...args: any[]) =>
      this.buffer.push(`[WARN] ${args.join(' ')}`);
  }

  stop(): string {
    console.log = this.originalLog;
    console.error = this.originalError;
    console.warn = this.originalWarn;
    return this.buffer.join('\n');
  }
}

const capturer = new OutputCapturer();

const server = new McpServer({
  name: 'orbit',
  version: '1.0.0',
});

// --- TOOLS (For LLM Autonomy) ---

server.registerTool(
  'get_orbit_pulse',
  {
    description: 'Check the health and telemetry of Orbit host and capsules.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    capturer.start();
    await runStatus();
    const output = capturer.stop();
    return {
      content: [{ type: 'text', text: output }],
    };
  },
);

server.registerTool(
  'provision_mission',
  {
    description: 'Start or resume an Orbit mission for a PR or branch.',
    inputSchema: z.object({
      identifier: z.string(),
      action: z
        .enum(['mission', 'fix', 'review', 'implement', 'eva'])
        .default('mission'),
      prompt: z.string().optional(),
    }).shape,
  },
  async ({ identifier, action, prompt }) => {
    capturer.start();
    const args = [identifier, action];
    if (prompt) args.push(prompt);
    const code = await runOrchestrator(args);
    const output = capturer.stop();
    return {
      content: [
        {
          type: 'text',
          text: `Mission exit code: ${code}\n\nOutput:\n${output}`,
        },
      ],
    };
  },
);

server.registerTool(
  'jettison_capsule',
  {
    description: 'Remove an Orbit mission capsule and reclaim resources.',
    inputSchema: z.object({
      prNumber: z.string(),
      action: z.string().default('open'),
    }).shape,
  },
  async ({ prNumber, action }) => {
    capturer.start();
    await runJettison([prNumber, action]);
    const output = capturer.stop();
    return {
      content: [{ type: 'text', text: output }],
    };
  },
);

server.registerTool(
  'manage_constellation',
  {
    description:
      'Manage Orbit stations (list, provision, stop, destroy, rebuild).',
    inputSchema: z.object({
      action: z.enum(['list', 'provision', 'stop', 'destroy', 'rebuild']),
    }).shape,
  },
  async ({ action }) => {
    capturer.start();
    await runFleet([action]);
    const output = capturer.stop();
    return {
      content: [{ type: 'text', text: output }],
    };
  },
);

server.registerTool(
  'reap_idle_capsules',
  {
    description: 'Identify and remove idle mission capsules.',
    inputSchema: z.object({
      threshold: z.number().optional(),
      force: z.boolean().optional(),
    }).shape,
  },
  async ({ threshold, force }) => {
    capturer.start();
    await runReap({ threshold, force });
    const output = capturer.stop();
    return {
      content: [{ type: 'text', text: output }],
    };
  },
);

server.registerTool(
  'monitor_ci',
  {
    description: 'Monitor CI status for a branch.',
    inputSchema: z.object({
      branch: z.string().optional(),
      runId: z.string().optional(),
    }).shape,
  },
  async ({ branch, runId }) => {
    capturer.start();
    const args = [];
    if (branch) args.push(branch);
    if (runId) args.push(runId);
    await runCI(args);
    const output = capturer.stop();
    return {
      content: [{ type: 'text', text: output }],
    };
  },
);

// --- PROMPTS (For User Slash Commands) ---

server.registerPrompt(
  'pulse',
  {
    description: 'Show mission constellation health.',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Check my orbit pulse and list active mission capsules.',
        },
      },
    ],
  }),
);

server.registerPrompt(
  'mission',
  {
    description: 'Launch or resume an orbital mission.',
    argsSchema: {
      identifier: z.string(),
      action: z.string().optional(),
    },
  },
  ({ identifier, action }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Start an orbit mission for ${identifier}${action ? ` using action ${action}` : ''}.`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  'liftoff',
  {
    description: 'Initial station setup and provisioning.',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Perform orbit liftoff to setup my station.',
        },
      },
    ],
  }),
);

server.registerPrompt(
  'splashdown',
  {
    description: 'Full mission cleanup: destroy station and capsules.',
    argsSchema: {
      all: z.boolean().optional(),
    },
  },
  ({ all }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Initiate a full orbit splashdown${all ? ' --all' : ''}.`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  'reap',
  {
    description: 'Cleanup idle mission capsules.',
    argsSchema: {
      threshold: z.string().optional(),
    },
  },
  ({ threshold }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Reap any idle orbit capsules${threshold ? ` with threshold ${threshold} hours` : ''}.`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  'constellation',
  {
    description: 'Manage the mission constellation.',
    argsSchema: {
      action: z
        .enum(['list', 'provision', 'stop', 'destroy', 'rebuild'])
        .default('list'),
    },
  },
  ({ action }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Manage my orbit constellation with action: ${action}`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  'jettison',
  {
    description: 'Remove a specific mission capsule.',
    argsSchema: {
      pr: z.string(),
    },
  },
  ({ pr }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Jettison orbit capsule for PR ${pr}`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  'ci',
  {
    description: 'Monitor CI status for a branch.',
    argsSchema: {
      branch: z.string().optional(),
    },
  },
  ({ branch }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Monitor CI status${branch ? ` for branch ${branch}` : ''}.`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  'uplink',
  {
    description: 'Establish a real-time connection to a remote mission.',
    argsSchema: {
      pr: z.string(),
      action: z.string().optional(),
    },
  },
  ({ pr, action }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Uplink to orbit mission PR ${pr}${action ? ` (${action})` : ''}.`,
        },
      },
    ],
  }),
);

server.registerPrompt(
  'blackbox',
  {
    description: 'Inspect recorded local mission logs.',
    argsSchema: {
      pr: z.string(),
    },
  },
  ({ pr }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Show blackbox logs for mission PR ${pr}`,
        },
      },
    ],
  }),
);

// --- START SERVER ---

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('MCP Server Error:', err);
  process.exit(1);
});

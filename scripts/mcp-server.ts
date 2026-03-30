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
import { runDesign } from './fleet.js';

/**
 * Helper to capture stdout/stderr during a tool's execution.
 * This ensures the main protocol stream (stdout) remains pure.
 */
async function runWithCapture(fn: () => Promise<any>): Promise<string> {
  const buffer: string[] = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  // Intercept writes
  process.stdout.write = ((chunk: any, encoding?: any, cb?: any) => {
    buffer.push(chunk.toString());
    if (typeof cb === 'function') cb();
    return true;
  }) as any;

  process.stderr.write = ((chunk: any, encoding?: any, cb?: any) => {
    buffer.push(chunk.toString());
    if (typeof cb === 'function') cb();
    return true;
  }) as any;

  try {
    await fn();
  } finally {
    // Restore
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }

  return buffer.join('');
}

const server = new McpServer({
  name: 'orbit',
  version: '1.0.0',
});

// --- TOOLS ---

server.registerTool(
  'get_mission_guidelines',
  {
    description:
      'Get expert instructions and architectural guidelines for Orbit missions.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const guidelines = `
# Gemini Orbit Mission Guidelines

You are an expert in managing high-performance remote missions.

## Core Mandates
1. **Host-Capsule Separation**: Always maintain the distinction between the persistent Host Station and ephemeral Job Capsules.
2. **Read-Only Source**: Never mount the main host mirror as Read-Write into capsules.
3. **Behavioral Proof (Mustard Test)**: Every implementation or review MUST attempt a physical verification in the remote terminal.
4. **Path Parity**: Use absolute paths (/mnt/disks/data/...) to ensure consistency across environments.

## Available Mission Types
- **review**: Parallelized PR analysis with automated build and behavioral proof.
- **fix**: Iterative repair of CI failures and merge conflicts.
- **implement**: Autonomous feature execution with test-first logic.
- **ci**: High-performance monitoring and failure replication.

## Local Worktree Mode
- Use 'local-worktree' provider for zero-overhead local development.
- Worktrees are created as siblings in ~/dev/<repo>/ (e.g., ~/dev/orbit/feat-branch).
- Persistent sessions are managed via tmux: orbit-<branch>.
- Automatically resolves PR numbers to branch names via GH CLI.
- **Dependencies**: If 'tmux' or other local tools are missing, you are authorized to attempt installation (e.g., 'brew install tmux' on macOS) to ensure full functionality.

## Architectural Roadmap
- **Command Dispatcher**: Transitioning to a centralized \`CommandDispatcher\` for all \`spawn\`/\`exec\` calls to ensure type safety (\`.node()\`, \`.docker()\`, \`.gcloud()\`).
- **App Restructuring**: Moving towards a unified \`src/\` structure with a single entry point for the MCP server and CLI tools.
`;
    return {
      content: [{ type: 'text', text: guidelines }],
    };
  },
);

server.registerTool(
  'get_orbit_pulse',
  {
    description: 'Check the health and telemetry of Orbit host and capsules.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const output = await runWithCapture(() => runStatus());
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
    let code: number | undefined;
    const output = await runWithCapture(async () => {
      const args = [identifier, action];
      if (prompt) args.push(prompt);
      code = await runOrchestrator(args);
    });
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
    const output = await runWithCapture(() => runJettison([prNumber, action]));
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
    const output = await runWithCapture(() => runDesign(['station', action]));
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
    const output = await runWithCapture(() =>
      runReap({
        ...(threshold !== undefined ? { threshold } : {}),
        ...(force !== undefined ? { force } : {}),
      }),
    );
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
    const output = await runWithCapture(() => {
      const args = [];
      if (branch) args.push(branch);
      if (runId) args.push(runId);
      return runCI(args);
    });
    return {
      content: [{ type: 'text', text: output }],
    };
  },
);

// --- PROMPTS ---

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

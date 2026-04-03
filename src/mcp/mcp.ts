/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  OrbitSDK,
  type OrbitObserver,
  type IOrbitSDK,
} from '../sdk/OrbitSDK.js';
import { getRepoConfig, detectRepoName } from '../core/ConfigManager.js';
import { LogLevel } from '../core/Logger.js';

/**
 * MCP Observer that captures logs into a buffer to be returned as tool output.
 */
class McpObserver implements OrbitObserver {
  private buffer: string[] = [];

  onLog(level: LogLevel, tag: string, message: string, ...args: any[]): void {
    const levelStr = LogLevel[level].padEnd(5);
    const tagStr = tag ? `[${tag.padEnd(8)}] ` : '';
    const formatted = `[${levelStr}] ${tagStr}${message}${args.length > 0 ? ' ' + JSON.stringify(args) : ''}`;
    this.buffer.push(formatted);
  }

  onProgress(phase: string, message: string): void {
    this.buffer.push(`\n--- ${phase} ---`);
    this.buffer.push(`   ${message}`);
  }

  onDivider(title?: string): void {
    const line = '-'.repeat(40);
    this.buffer.push(title ? `\n--- ${title} ---` : `\n${line}`);
  }

  getOutput(): string {
    const out = this.buffer.join('\n');
    this.buffer = [];
    return out;
  }
}

const observer = new McpObserver();

function getSDK(repoOverride?: string): IOrbitSDK {
  const repoRoot = process.cwd();
  const repoName = repoOverride || detectRepoName(repoRoot);
  const config = getRepoConfig(repoName, undefined, repoRoot);
  return new OrbitSDK(config, observer, repoRoot);
}

const server = new McpServer({
  name: 'orbit',
  version: '1.0.0',
});

// --- MISSION TOOLS (The Workflow) ---

server.registerTool(
  'mission_start',
  {
    description: 'Launch or resume an Orbit mission for a PR or branch.',
    inputSchema: z.object({
      identifier: z.string().describe('PR number or branch name'),
      action: z
        .enum(['chat', 'fix', 'review', 'implement', 'eva'])
        .default('chat'),
      prompt: z
        .string()
        .optional()
        .describe('Initial instruction for the mission'),
    }).shape,
  },
  async ({ identifier, action, prompt }) => {
    const sdk = getSDK();
    const result = await sdk.startMission({
      identifier,
      action,
      args: prompt ? [prompt] : [],
    });
    const output = observer.getOutput();
    return {
      content: [
        {
          type: 'text',
          text: `Mission: ${result.missionId}\nExit Code: ${result.exitCode}\n\nLogs:\n${output}`,
        },
      ],
    };
  },
);

server.registerTool(
  'mission_uplink',
  {
    description: 'Inspect latest mission telemetry and logs.',
    inputSchema: z.object({
      identifier: z.string().describe('PR number or branch name'),
      action: z
        .string()
        .default('review')
        .describe('The mission type (chat, review, fix, etc.)'),
    }).shape,
  },
  async ({ identifier, action }) => {
    const sdk = getSDK();
    const code = await sdk.getLogs({ identifier, action });
    const output = observer.getOutput();
    return {
      content: [
        { type: 'text', text: `Exit Code: ${code}\n\nLogs:\n${output}` },
      ],
    };
  },
);

server.registerTool(
  'mission_ci',
  {
    description: 'Monitor CI status for a mission branch.',
    inputSchema: z.object({
      branch: z.string().describe('The branch to monitor'),
      runId: z.string().optional().describe('Optional specific GitHub Run ID'),
    }).shape,
  },
  async ({ branch, runId }) => {
    const sdk = getSDK();
    const status = await sdk.monitorCI({ branch, runId });
    let text = `Status: ${status.status}\nRuns: ${status.runs.join(', ')}\n`;
    if (status.failures) {
      for (const [cat, fails] of status.failures.entries()) {
        text += `\n[${cat}]\n`;
        fails.forEach((f) => (text += `  - ${f}\n`));
      }
    }
    const output = observer.getOutput();
    if (output) text += `\nLogs:\n${output}`;
    return { content: [{ type: 'text', text }] };
  },
);

server.registerTool(
  'mission_jettison',
  {
    description:
      'Decommission mission-specific resources (capsules and workspaces).',
    inputSchema: z.object({
      identifier: z.string().describe('PR number or branch name'),
      action: z.string().default('chat'),
    }).shape,
  },
  async ({ identifier, action }) => {
    const sdk = getSDK();
    const result = await sdk.jettisonMission({ identifier, action });
    const output = observer.getOutput();
    return {
      content: [
        {
          type: 'text',
          text: `Exit Code: ${result.exitCode}\n\nLogs:\n${output}`,
        },
      ],
    };
  },
);

server.registerTool(
  'mission_get_guidelines',
  {
    description:
      'Get expert instructions and architectural guidelines for Orbit missions.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const guidelines = `
# Gemini Orbit Mission Guidelines

## Core Mandates
1. **Host-Capsule Separation**: Persistent Host Station vs. ephemeral Job Capsules.
2. **Read-Only Source**: Never mount host mirror as Read-Write into capsules.
3. **Behavioral Proof**: Every implementation/review MUST attempt verification in the remote terminal.
4. **Path Parity**: Use absolute paths (/mnt/disks/data/...) for consistency.
`;
    return { content: [{ type: 'text', text: guidelines }] };
  },
);

// --- STATION TOOLS (The Hardware) ---

server.registerTool(
  'station_pulse',
  {
    description:
      'Check health and active mission capsules for the active station.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const sdk = getSDK();
    const pulse = await sdk.getPulse();
    let text = `Station: ${pulse.stationName} (${pulse.status})\n`;
    text += `IP: ${pulse.internalIp || 'N/A'} / ${pulse.externalIp || 'N/A'}\n\n`;
    text +=
      pulse.capsules.length === 0
        ? `Capsules: None found.`
        : `Capsules:\n` +
          pulse.capsules
            .map((c) => ` - ${c.name} [${c.state}] ${c.stats || ''}`)
            .join('\n');
    return { content: [{ type: 'text', text }] };
  },
);

server.registerTool(
  'station_manage',
  {
    description: 'Manage Orbit stations (list, activate, hibernate, delete).',
    inputSchema: z.object({
      action: z.enum(['list', 'activate', 'hibernate', 'delete']),
      name: z.string().optional().describe('The instance name of the station'),
    }).shape,
  },
  async ({ action, name }) => {
    const sdk = getSDK();
    let text = '';
    if (action === 'list') {
      const stations = await sdk.listStations({ syncWithReality: true });
      text = stations
        .map(
          (s) =>
            `${s.isActive ? '*' : ' '} ${s.name} (${s.type}) [${s.repo}] - ${s.status || 'READY'}`,
        )
        .join('\n');
    } else if (action === 'activate' && name) {
      await sdk.activateStation(name);
      text = `Station ${name} activated.`;
    } else if (action === 'hibernate' && name) {
      await sdk.hibernate({ name });
      text = `Station ${name} hibernated.`;
    } else if (action === 'delete' && name) {
      await sdk.deleteStation({ name });
      text = `Station ${name} decommissioned.`;
    }
    const output = observer.getOutput();
    if (output) text += `\n\nLogs:\n${output}`;
    return { content: [{ type: 'text', text }] };
  },
);

server.registerTool(
  'station_reap',
  {
    description: 'Identify and remove idle mission capsules.',
    inputSchema: z.object({
      threshold: z.number().optional().describe('Idle threshold in hours'),
      force: z.boolean().optional().describe('Force cleanup even if busy'),
    }).shape,
  },
  async ({ threshold, force }) => {
    const sdk = getSDK();
    const count = await sdk.reapMissions({ threshold, force });
    const output = observer.getOutput();
    return {
      content: [
        { type: 'text', text: `Reaped missions: ${count}\n\nLogs:\n${output}` },
      ],
    };
  },
);

// --- INFRA TOOLS (The Foundation) ---

server.registerTool(
  'infra_liftoff',
  {
    description: 'Build or wake Orbital Station infrastructure. (Idempotent)',
    inputSchema: z.object({
      name: z
        .string()
        .describe('The human-friendly name for this station instance'),
      schematic: z
        .string()
        .optional()
        .describe('Blueprint to use if creating new'),
      destroy: z.boolean().optional().describe('Decommission infrastructure'),
    }).shape,
  },
  async ({ name: _name, schematic, destroy }) => {
    const sdk = getSDK();
    const code = await sdk.provisionStation({
      schematicName: schematic,
      destroy,
    });
    const output = observer.getOutput();
    return {
      content: [
        { type: 'text', text: `Exit Code: ${code}\n\nLogs:\n${output}` },
      ],
    };
  },
);

// --- CONFIG TOOLS (The Local) ---

server.registerTool(
  'config_install',
  {
    description: 'Install Orbit shell aliases and tab-completion.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const sdk = getSDK();
    await sdk.installShell();
    const output = observer.getOutput();
    return {
      content: [
        { type: 'text', text: output || 'Shell integration installed.' },
      ],
    };
  },
);

// --- PROMPT REGISTRATIONS ---

server.registerPrompt(
  'mission',
  {
    description: 'Launch or resume an isolated developer mission.',
    argsSchema: {
      identifier: z.string().describe('PR number or branch name'),
      action: z
        .string()
        .optional()
        .describe('Action: chat, fix, review, implement, eva'),
      prompt: z
        .string()
        .optional()
        .describe('Initial instructions for the mission'),
    },
  },
  async ({ identifier, action, prompt }) => {
    return {
      description: `Orbit Mission: ${identifier} (${action || 'chat'})`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I want to start an Orbit mission for ${identifier}${action ? ' with action ' + action : ''}.${prompt ? ' Here are my instructions: ' + prompt : ''}`,
          },
        },
      ],
    };
  },
);

server.registerPrompt(
  'station',
  {
    description: 'Hardware management and status check.',
    argsSchema: {
      action: z.string().optional().describe('Action: list, pulse, reap'),
    },
  },
  async ({ action }) => {
    const verb = action || 'pulse';
    return {
      description: `Orbit Station: ${verb}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Show me the Orbit station ${verb} status.`,
          },
        },
      ],
    };
  },
);

server.registerPrompt(
  'liftoff',
  {
    description: 'Infrastructure provisioning (build or wake hardware).',
    argsSchema: {
      name: z.string().describe('The human-friendly name for the station'),
      schematic: z.string().optional().describe('The blueprint to use'),
    },
  },
  async ({ name, schematic }) => {
    return {
      description: `Orbit Liftoff: ${name}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Trigger Orbit liftoff for station ${name}${schematic ? ' using schematic ' + schematic : ''}.`,
          },
        },
      ],
    };
  },
);

// --- START SERVER ---

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('MCP Server Error:', err);
  process.exit(1);
});

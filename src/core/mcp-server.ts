/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { OrbitSDK, type OrbitObserver, type IOrbitSDK } from './OrbitSDK.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import { LogLevel } from './Logger.js';

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

  getOutput(): string {
    const out = this.buffer.join('\n');
    this.buffer = [];
    return out;
  }
}

const observer = new McpObserver();

function getSDK(repoOverride?: string): IOrbitSDK {
  const repoName = repoOverride || detectRepoName();
  const config = getRepoConfig(repoName);
  return new OrbitSDK(config, observer);
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
3. **Behavioral Proof (Behavioral Proof)**: Every implementation or review MUST attempt a physical verification in the remote terminal.
4. **Path Parity**: Use absolute paths (/mnt/disks/data/...) to ensure consistency across environments.

## Available Mission Types
- **review**: Parallelized PR analysis with automated build and behavioral proof.
- **fix**: Iterative repair of CI failures and merge conflicts.
- **implement**: Autonomous feature execution with test-first logic.
- **ci**: High-performance monitoring and failure replication.
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
    const sdk = getSDK();
    const pulse = await sdk.getPulse();

    let text = `Station: ${pulse.stationName} (${pulse.status})\n`;
    text += `IP: ${pulse.internalIp || 'N/A'} / ${pulse.externalIp || 'N/A'}\n\n`;
    text += `Capsules:\n`;

    if (pulse.capsules.length === 0) {
      text += ` - None found.`;
    } else {
      pulse.capsules.forEach((c) => {
        text += ` - ${c.name} [${c.state}] ${c.stats || ''}\n`;
      });
    }

    return {
      content: [{ type: 'text', text }],
    };
  },
);

server.registerTool(
  'get_uplink_logs',
  {
    description: 'Inspect local or remote mission telemetry.',
    inputSchema: z.object({
      identifier: z.string(),
      action: z.string().default('review'),
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
  'provision_mission',
  {
    description: 'Start or resume an Orbit mission for a PR or branch.',
    inputSchema: z.object({
      identifier: z.string(),
      action: z
        .enum(['chat', 'fix', 'review', 'implement', 'eva'])
        .default('chat'),
      prompt: z.string().optional(),
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
  'jettison_capsule',
  {
    description: 'Remove an Orbit mission capsule and reclaim resources.',
    inputSchema: z.object({
      prNumber: z.string(),
      action: z.string().default('chat'),
    }).shape,
  },
  async ({ prNumber, action }) => {
    const sdk = getSDK();
    const result = await sdk.jettisonMission({ identifier: prNumber, action });
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
  'manage_constellation',
  {
    description: 'Manage Orbit stations (list, activate, delete).',
    inputSchema: z.object({
      action: z.enum(['list', 'activate', 'delete']),
      name: z.string().optional(),
    }).shape,
  },
  async ({ action, name }) => {
    const sdk = getSDK();
    let text = '';

    if (action === 'list') {
      const stations = await sdk.listStations({});
      text = stations
        .map(
          (s) => `${s.isActive ? '*' : ' '} ${s.name} (${s.type}) [${s.repo}]`,
        )
        .join('\n');
    } else if (action === 'activate' && name) {
      await sdk.activateStation(name);
      text = `Station ${name} activated.`;
    } else if (action === 'delete' && name) {
      await sdk.deleteStation({ name });
      text = `Station ${name} decommissioned.`;
    }

    const output = observer.getOutput();
    if (output) text += `\n\nLogs:\n${output}`;

    return {
      content: [{ type: 'text', text }],
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
    const sdk = getSDK();
    const count = await sdk.reapMissions({
      threshold: threshold as number,
      force: force as boolean,
    });
    const output = observer.getOutput();
    return {
      content: [
        { type: 'text', text: `Reaped missions: ${count}\n\nLogs:\n${output}` },
      ],
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
    const sdk = getSDK();
    const status = await sdk.monitorCI({
      branch: branch || undefined,
      runId: runId || undefined,
    });
    let text = `Status: ${status.status}\nRuns: ${status.runs.join(', ')}\n`;
    if (status.failures) {
      for (const [cat, fails] of status.failures.entries()) {
        text += `\n[${cat}]\n`;
        fails.forEach((f) => (text += `  - ${f}\n`));
      }
    }
    const output = observer.getOutput();
    if (output) text += `\nLogs:\n${output}`;
    return {
      content: [{ type: 'text', text }],
    };
  },
);

server.registerTool(
  'install_shell',
  {
    description:
      'Install Orbit shell aliases and tab-completion for ZSH and Bash.',
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

// --- START SERVER ---

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('MCP Server Error:', err);
  process.exit(1);
});

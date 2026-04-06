/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// We need to import the server setup from mcp.ts, but mcp.ts starts the server immediately.
// For testing, we'll recreate the server setup or refactor mcp.ts to export the server instance.
// Since we can't easily refactor mcp.ts without potentially breaking it,
// I'll create a factory function in mcp.ts and export it.

import { createOrbitMcpServer } from './mcp.js';

// Mock the SDK
const mockProvisionStation = vi.fn().mockResolvedValue(0);
const mockResolveMission = vi.fn().mockResolvedValue({
  identifier: 'mock-id',
  repoName: 'mock-repo',
  branchName: 'mock-branch',
  action: 'chat',
  workDir: '/mock/work',
  containerName: 'mock-container',
  sessionName: 'mock-session',
  policyPath: '/mock/policy',
  upstreamUrl: 'http://git.mock',
});
const mockStartMission = vi
  .fn()
  .mockResolvedValue({ exitCode: 0, missionId: 'test-mission' });
const mockGetFleetState = vi.fn().mockResolvedValue([]);
const mockMonitorCI = vi
  .fn()
  .mockResolvedValue({ status: 'PASSED', runs: ['123'] });
const mockJettisonMission = vi.fn().mockResolvedValue({ exitCode: 0 });
const mockActivateStation = vi.fn().mockResolvedValue(undefined);
const mockHibernate = vi.fn().mockResolvedValue(undefined);
const mockSplashdown = vi.fn().mockResolvedValue(0);
const mockListSchematics = vi
  .fn()
  .mockReturnValue([{ name: 'test-s', projectId: 'p' }]);
const mockGetSchematic = vi.fn().mockReturnValue({ projectId: 'p' });
const mockSaveSchematic = vi.fn().mockResolvedValue(undefined);
const mockReapMissions = vi.fn().mockResolvedValue(2);
const mockGetLogs = vi.fn().mockResolvedValue(0);
const mockInstallShell = vi.fn().mockResolvedValue(undefined);

vi.mock('../sdk/OrbitSDK.js', () => ({
  OrbitSDK: vi.fn().mockImplementation(() => ({
    provisionStation: mockProvisionStation,
    resolveMission: mockResolveMission,
    startMission: mockStartMission,
    getFleetState: mockGetFleetState,
    monitorCI: mockMonitorCI,
    jettisonMission: mockJettisonMission,
    activateStation: mockActivateStation,
    hibernate: mockHibernate,
    splashdown: mockSplashdown,
    listSchematics: mockListSchematics,
    getSchematic: mockGetSchematic,
    saveSchematic: mockSaveSchematic,
    reapMissions: mockReapMissions,
    getLogs: mockGetLogs,
    installShell: mockInstallShell,
  })),
}));

vi.mock('../core/ContextResolver.js', () => ({
  ContextResolver: {
    resolve: vi.fn().mockResolvedValue({
      project: { repoName: 'test-repo', repoRoot: '/tmp' },
      infra: { instanceName: 'mock-instance' },
    }),
  },
}));

describe('MCP Server Integration', () => {
  let server: McpServer;
  let client: Client;
  let serverTransport: InMemoryTransport;
  let clientTransport: InMemoryTransport;

  beforeEach(async () => {
    vi.clearAllMocks();

    server = createOrbitMcpServer();
    [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  describe('Mission Tools', () => {
    it('should call mission_start correctly and return logs', async () => {
      const result = await client.callTool({
        name: 'mission_start',
        arguments: {
          identifier: '123',
          action: 'review',
          prompt: 'Fix all bugs',
        },
      });

      expect(mockResolveMission).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '123',
          action: 'review',
          args: ['Fix all bugs'],
        }),
      );
      expect(mockStartMission).toHaveBeenCalled();
      expect((result.content as any)[0].type).toBe('text');
      expect((result.content as any)[0].text).toContain(
        'Mission: test-mission',
      );
    });

    it('should call mission_ci correctly', async () => {
      const result = await client.callTool({
        name: 'mission_ci',
        arguments: {
          branch: 'feat-1',
        },
      });

      expect(mockMonitorCI).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: 'feat-1',
        }),
      );
      expect((result.content as any)[0].text).toContain('Status: PASSED');
    });

    it('should call mission_jettison correctly', async () => {
      await client.callTool({
        name: 'mission_jettison',
        arguments: {
          identifier: '123',
          action: 'chat',
        },
      });

      expect(mockJettisonMission).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '123',
          action: 'chat',
        }),
      );
    });
  });

  describe('Infrastructure Tools', () => {
    it('should call infra_liftoff with stationName override', async () => {
      await client.callTool({
        name: 'infra_liftoff',
        arguments: {
          name: 'my-custom-station',
          schematic: 'high-perf',
        },
      });

      expect(mockProvisionStation).toHaveBeenCalledWith(
        expect.objectContaining({
          stationName: 'my-custom-station',
          schematicName: 'high-perf',
        }),
      );
    });

    it('should call infra_manage list correctly', async () => {
      const result = await client.callTool({
        name: 'infra_manage',
        arguments: {
          action: 'list',
          name: 'ignored',
        },
      });

      expect(mockListSchematics).toHaveBeenCalled();
      expect((result.content as any)[0].text).toContain('test-s (p)');
    });
  });

  describe('Station Tools', () => {
    it('should call constellation correctly', async () => {
      await client.callTool({
        name: 'constellation',
        arguments: {
          sync: true,
          pulse: true,
        },
      });

      expect(mockGetFleetState).toHaveBeenCalledWith(
        expect.objectContaining({
          syncWithReality: true,
          includeMissions: true,
        }),
      );
    });

    it('should call station_manage hibernate correctly', async () => {
      await client.callTool({
        name: 'station_manage',
        arguments: {
          action: 'hibernate',
          name: 'my-box',
        },
      });

      expect(mockHibernate).toHaveBeenCalledWith({ name: 'my-box' });
    });

    it('should call station_reap correctly', async () => {
      const result = await client.callTool({
        name: 'station_reap',
        arguments: {
          threshold: 12,
        },
      });

      expect(mockReapMissions).toHaveBeenCalledWith(
        expect.objectContaining({
          threshold: 12,
        }),
      );
      expect((result.content as any)[0].text).toContain('Reaped missions: 2');
    });
  });
});

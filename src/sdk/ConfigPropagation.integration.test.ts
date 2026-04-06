/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MissionManager } from './MissionManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { ConfigManager } from '../core/ConfigManager.js';
import { StationRegistry } from './StationRegistry.js';
import { ContextResolver } from '../core/ContextResolver.js';
import { NodeExecutor } from '../core/executors/NodeExecutor.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('node:fs');
vi.mock('node:os', () => ({
  default: {
    homedir: () => '/home/node',
    platform: () => 'linux',
  },
  homedir: () => '/home/node',
  platform: () => 'linux',
}));

describe('Config Propagation Integration', () => {
  const repoRoot = '/repo/main';
  const projectCtx = { repoName: 'test-repo', repoRoot };
  const schematicName = 'corp-blueprint';
  const stationName = 'remote-station-v1';

  let mockPm: any;
  let executors: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('USER', 'mock-user');

    mockPm = {
      runSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
      runAsync: vi.fn(),
      spawn: vi.fn(),
    };

    executors = {
      node: new NodeExecutor(mockPm),
      git: {
        init: vi.fn().mockReturnValue({ status: 0 }),
        remoteAdd: vi.fn().mockReturnValue({ status: 0 }),
        fetch: vi.fn().mockReturnValue({ status: 0 }),
        checkout: vi.fn().mockReturnValue({ status: 0 }),
      },
      docker: {
        inspect: vi.fn().mockReturnValue({ status: 0, stdout: 'true' }),
      },
    };

    // Setup directory structure
    const norm = (p: string) => p.replace(/\\/g, '/');
    (fs.existsSync as any).mockImplementation((p: string) => {
      const n = norm(p);
      if (n.includes('.gemini/orbit/schematics')) return true;
      if (n.includes('.gemini/orbit/stations')) return true;
      if (n.includes(`${schematicName}.json`)) return true;
      if (n.includes(`${stationName}.json`)) return true;
      return false;
    });

    // Mock schematic and receipt
    const schematicData = {
      projectId: 'corp-project-123',
      zone: 'us-east1-b',
      dnsSuffix: 'internal.gcpnode.com',
      userSuffix: '_google_com',
      backendType: 'direct-internal',
    };

    const receiptData = {
      name: stationName,
      instanceName: stationName,
      type: 'gce',
      projectId: 'corp-project-123',
      zone: 'us-east1-b',
      schematic: schematicName, // This is the crucial link
    };

    (fs.readFileSync as any).mockImplementation((p: string) => {
      const n = norm(p);
      if (n.includes(`${schematicName}.json`))
        return JSON.stringify(schematicData);
      if (n.includes(`${stationName}.json`)) return JSON.stringify(receiptData);
      if (n.includes('settings.json')) return JSON.stringify({ repos: {} });
      return '{}';
    });
  });

  it('should propagate dnsSuffix from schematic to SSH commands during mission launch', async () => {
    vi.useFakeTimers();

    // 1. Resolve context using the real resolver and our mocked FS
    const context = await ContextResolver.resolve({
      repoRoot,
      flags: {
        forStation: stationName,
        dnsSuffix: undefined, // This "poison" value should NOT overwrite the schematic
      },
      env: { USER: 'mock-user' },
    });

    const configManager = new ConfigManager();
    const providerFactory = new ProviderFactory(mockPm, executors);
    const stationRegistry = new StationRegistry(providerFactory, configManager);

    const manager = new MissionManager(
      context.project,
      context.infra,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
      providerFactory,
      configManager,
      mockPm,
      executors,
      stationRegistry,
    );

    // Start mission in background so we can advance timers
    const manifest = await manager.resolve({
      identifier: 'branch-name',
      action: 'chat',
    });
    const startPromise = manager.start(manifest);

    // Advance timers to get through any loops
    await vi.runAllTimersAsync();

    try {
      await startPromise;
    } catch (e) {}

    const sshCalls = mockPm.runSync.mock.calls.filter(
      (c: any) => c[0] === 'ssh',
    );
    const expectedHostname = `nic0.${stationName}.us-east1-b.c.corp-project-123.internal.gcpnode.com`;

    const matchedCall = sshCalls.find((c: any) =>
      c[1].join(' ').includes(expectedHostname),
    );

    if (!matchedCall) {
      console.log(
        'FAIL: DNS Suffix missing. Actual hostname used in SSH:',
        sshCalls[0]?.[1].find((a: string) => a.includes('@')),
      );
    }

    expect(matchedCall).toBeDefined();
    vi.useRealTimers();
  });
});

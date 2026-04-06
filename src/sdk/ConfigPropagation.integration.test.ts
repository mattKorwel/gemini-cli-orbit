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
      ssh: {
        exec: vi
          .fn()
          .mockImplementation((target, command, options) =>
            mockPm.runSync('ssh', [target, command], options),
          ),
        rsync: vi
          .fn()
          .mockImplementation((local, remote, options) =>
            mockPm.runSync('rsync', [local, remote], options),
          ),
      },
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
    } catch (_e) {}

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

  it('should upgrade a stale local-worktree receipt to GCE when explicitly using a remote schematic', async () => {
    const staleStation = 'stale-local-1';
    const remoteSchematic = 'remote-gold';

    // 1. Setup mocks for this specific case
    const norm = (p: string) => p.replace(/\\/g, '/');
    (fs.existsSync as any).mockImplementation((p: string) => {
      const n = norm(p);
      if (n.includes(`${staleStation}.json`)) return true;
      if (n.includes(`${remoteSchematic}.json`)) return true;
      if (n.includes('settings.json')) return true;
      return false;
    });

    const staleReceipt = {
      name: staleStation,
      type: 'local-worktree',
      projectId: 'local',
      instanceName: staleStation,
    };

    const goldSchematic = {
      projectId: 'real-corp-99',
      zone: 'us-west1-a',
      providerType: 'gce',
    };

    (fs.readFileSync as any).mockImplementation((p: string) => {
      const n = norm(p);
      if (n.includes(`${staleStation}.json`))
        return JSON.stringify(staleReceipt);
      if (n.includes(`${remoteSchematic}.json`))
        return JSON.stringify(goldSchematic);
      return '{}';
    });

    // 2. Resolve context
    const context = await ContextResolver.resolve({
      repoRoot,
      flags: {
        forStation: staleStation,
        schematic: remoteSchematic,
      },
      env: {},
    });

    // 3. Verify core context upgrade
    expect(context.infra.providerType).toBe('gce');
    expect(context.infra.projectId).toBe('real-corp-99');

    // 4. Verify Provider Selection
    const providerFactory = new ProviderFactory(mockPm, executors);
    const provider = providerFactory.getProvider(
      context.project,
      context.infra,
    );

    expect(provider.type).toBe('gce');
    expect((provider as any).projectId).toBe('real-corp-99');
  });
});

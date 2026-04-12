/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextResolver } from './ContextResolver.js';
import * as ConfigManager from './ConfigManager.js';

vi.mock('./ConfigManager.js', () => ({
  sanitizeName: vi.fn((n: string) =>
    n.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase(),
  ),
  getProjectConfigPath: vi.fn(),
  loadSettings: vi.fn(),
  loadProjectConfig: vi.fn(),
  getRepoConfig: vi.fn(),
  detectRepoName: vi.fn(),
  loadJson: vi.fn(),
  loadSchematic: vi.fn(),
}));
vi.mock('node:fs');

describe('ContextResolver', () => {
  const repoRoot = '/repo';
  const repoName = 'test-repo';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('USER', 'test-user');

    // Default mocks
    vi.spyOn(ConfigManager, 'detectRepoName').mockReturnValue(repoName);
    vi.spyOn(ConfigManager, 'loadProjectConfig').mockReturnValue({});
    vi.spyOn(ConfigManager, 'loadSettings').mockReturnValue({ repos: {} });
    vi.spyOn(ConfigManager, 'loadJson').mockReturnValue(null);
    vi.spyOn(ConfigManager, 'loadSchematic').mockReturnValue({});
  });

  it('should default to local-worktree when no station or project ID is provided', async () => {
    const context = await ContextResolver.resolve({
      repoRoot,
      flags: {},
      env: {},
    });

    expect(context.infra.providerType).toBe('local-worktree');
    expect(context.infra.projectId).toBe('local');
  });

  it('should map --local-docker flag to local-docker provider', async () => {
    const context = await ContextResolver.resolve({
      repoRoot,
      flags: { localDocker: true } as any,
      env: {},
    });

    expect(context.infra.providerType).toBe('local-docker');
    expect(context.infra.projectId).toBe('local');
    expect(context.infra.zone).toBe('localhost');
    expect(context.infra.workspacesDir).toBe(
      './orbit-git-worktrees/workspaces',
    );
  });

  it('should resolve to GCE when a projectId is provided via flags', async () => {
    const context = await ContextResolver.resolve({
      repoRoot,
      flags: { projectId: 'my-project', zone: 'us-central1-a' },
      env: {},
    });

    // THIS IS EXPECTED TO FAIL CURRENTLY IF IT DEFAULTS TO LOCAL
    expect(context.infra.providerType).toBe('gce');
    expect(context.infra.projectId).toBe('my-project');
  });

  it('should NOT let undefined flags clobber schematic values', async () => {
    // 1. Setup a schematic with a DNS suffix
    vi.spyOn(ConfigManager, 'loadSchematic').mockReturnValue({
      projectId: 'corp-project',
      dnsSuffix: 'internal.gcpnode.com',
    });

    // 2. Resolve with a flag that has dnsSuffix: undefined (typical yargs output)
    const context = await ContextResolver.resolve({
      repoRoot,
      flags: {
        schematic: 'corp-v1',
        dnsSuffix: undefined as any,
      },
      env: {},
    });

    // FAIL POINT: If we use a simple spread, this will be undefined
    expect(context.infra.dnsSuffix).toBe('internal.gcpnode.com');
  });

  it('should resolve through the full chain: Flag -> Receipt -> Schematic', async () => {
    // 1. Receipt links to a schematic
    vi.spyOn(ConfigManager, 'loadJson').mockReturnValue({
      name: 'my-station',
      type: 'gce',
      schematic: 'gold-standard',
    });

    // 2. Schematic has the actual hardware details
    vi.spyOn(ConfigManager, 'loadSchematic').mockReturnValue({
      projectId: 'real-project',
      zone: 'us-west1-a',
      machineType: 'n4-standard-8',
    });

    const context = await ContextResolver.resolve({
      repoRoot,
      flags: { forStation: 'my-station' },
      env: {},
    });

    expect(context.infra.projectId).toBe('real-project');
    expect(context.infra.machineType).toBe('n4-standard-8');
    expect(context.infra.providerType).toBe('gce');
  });

  it('should hydrate runtime connection state from station receipt without pushing it into infra', async () => {
    vi.spyOn(ConfigManager, 'loadJson').mockReturnValue({
      name: 'my-station',
      type: 'gce',
      projectId: 'real-project',
      zone: 'us-west1-a',
      instanceName: 'my-station',
      externalIp: '34.1.2.3',
      sshUser: 'oslogin-user',
    });

    const context = await ContextResolver.resolve({
      repoRoot,
      flags: { forStation: 'my-station' },
      env: {},
    });

    expect(context.state).toEqual({
      status: 'ready',
      publicIp: '34.1.2.3',
      sshUser: 'oslogin-user',
    });
    expect(context.infra.instanceName).toBe('my-station');
    expect((context.infra as any).externalIp).toBeUndefined();
  });

  it('should prioritize explicit flags over schematic values', async () => {
    vi.spyOn(ConfigManager, 'loadSchematic').mockReturnValue({
      projectId: 'schematic-project',
      zone: 'us-east1-b',
    });

    const context = await ContextResolver.resolve({
      repoRoot,
      flags: {
        schematic: 'any',
        projectId: 'flag-project', // Overrides schematic
      },
      env: {},
    });

    expect(context.infra.projectId).toBe('flag-project');
    expect(context.infra.zone).toBe('us-east1-b');
  });

  it('should override a stale local-worktree receipt when an explicit remote schematic is provided', async () => {
    // 1. Receipt is stale and marked as local-worktree
    vi.spyOn(ConfigManager, 'loadJson').mockReturnValue({
      name: 'monday-test-1',
      type: 'local-worktree',
      projectId: 'local',
      instanceName: 'monday-test-1',
    });

    // 2. Schematic is remote
    vi.spyOn(ConfigManager, 'loadSchematic').mockReturnValue({
      projectId: 'real-remote-project',
      zone: 'us-central1-a',
      providerType: 'gce',
    });

    const context = await ContextResolver.resolve({
      repoRoot,
      flags: {
        forStation: 'monday-test-1',
        schematic: 'remote-blueprint',
      },
      env: {},
    });

    // CRITICAL: Should be upgraded to GCE because the schematic is remote
    expect(context.infra.projectId).toBe('real-remote-project');
    expect(context.infra.providerType).toBe('gce');
    expect(context.infra.zone).toBe('us-central1-a');
  });

  it('should prioritize schematic values over receipt values', async () => {
    // 1. Receipt has old dnsSuffix
    vi.spyOn(ConfigManager, 'loadJson').mockReturnValue({
      name: 'my-station',
      type: 'gce',
      dnsSuffix: 'old-suffix.internal',
      schematic: 'new-blueprint',
    });

    // 2. Schematic has new dnsSuffix
    vi.spyOn(ConfigManager, 'loadSchematic').mockReturnValue({
      projectId: 'real-project',
      dnsSuffix: 'new-suffix.gcpnode.com',
    });

    const context = await ContextResolver.resolve({
      repoRoot,
      flags: { forStation: 'my-station' },
      env: {},
    });

    // Schematic must win
    expect(context.infra.dnsSuffix).toBe('new-suffix.gcpnode.com');
  });

  it('should prioritize explicit flags over schematic values', async () => {
    vi.spyOn(ConfigManager, 'loadSchematic').mockReturnValue({
      projectId: 'schematic-project',
      dnsSuffix: 'schematic.suffix',
    });

    const context = await ContextResolver.resolve({
      repoRoot,
      flags: {
        schematic: 'any',
        dnsSuffix: 'flag.suffix', // Overrides schematic
      },
      env: {},
    });

    expect(context.infra.dnsSuffix).toBe('flag.suffix');
  });

  it('should propagate isDev from flags or environment', async () => {
    // 1. From Flag (alias 'dev')
    const ctx1 = await ContextResolver.resolve({
      repoRoot,
      flags: { dev: true } as any,
      env: {},
    });
    expect(ctx1.isDev).toBe(true);

    // 2. From Flag (explicit 'isDev')
    const ctx2 = await ContextResolver.resolve({
      repoRoot,
      flags: { isDev: true } as any,
      env: {},
    });
    expect(ctx2.isDev).toBe(true);

    // 3. From Environment
    const ctx3 = await ContextResolver.resolve({
      repoRoot,
      flags: {},
      env: { GCLI_ORBIT_DEV: '1' },
    });
    expect(ctx3.isDev).toBe(true);
  });
});

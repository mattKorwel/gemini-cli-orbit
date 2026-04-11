/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StarfleetHarness } from '../test/StarfleetHarness.js';
import { MissionManager } from './MissionManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { StationRegistry } from './StationRegistry.js';
import { StarfleetClient } from './StarfleetClient.js';
import { ConfigManager } from '../core/ConfigManager.js';

describe('Mission Resolution Behavior', () => {
  let harness: StarfleetHarness;

  beforeEach(() => {
    harness = new StarfleetHarness('MissionResolution');
  });

  afterEach(() => {
    harness.cleanup();
  });

  const createManager = (infra: any = {}) => {
    const pm = harness.createProcessManager();
    const executors = ProviderFactory.getExecutors(pm);
    const factory = new ProviderFactory(pm, executors);
    const configManager = new ConfigManager();
    const stationRegistry = new StationRegistry(factory, configManager);

    return new MissionManager(
      { repoRoot: harness.root, repoName: 'test-repo' },
      infra,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
      factory,
      configManager,
      pm,
      executors,
      stationRegistry,
      new StarfleetClient(),
    );
  };

  const normalize = (manifest: any, history: string[]) => {
    const rootPath = harness.root.replaceAll('\\', '/');
    const normalizePath = (p: string) =>
      typeof p === 'string'
        ? p.replaceAll('\\', '/').replaceAll(rootPath, '<tmp>')
        : p;

    return {
      manifest: {
        ...manifest,
        bundleDir: normalizePath(manifest.bundleDir),
        mirrorPath: normalizePath(manifest.mirrorPath),
        policyPath: normalizePath(manifest.policyPath),
        tempDir: normalizePath(manifest.tempDir),
      },
      history: history.map((line) =>
        line.replaceAll('\\', '/').replaceAll(rootPath, '<tmp>'),
      ),
    };
  };

  it('records resolution of a numeric PR ID via GH CLI', async () => {
    harness.stubScript(
      'gh',
      `
if (args.join(' ').includes('pr view 123')) {
  process.stdout.write('feat-branch\\n');
  process.exit(0);
}
process.exit(1);
`,
    );

    const manager = createManager();
    const manifest = await manager.resolve({
      identifier: '123',
      action: 'chat',
    });

    expect(normalize(manifest, harness.getHistory())).toMatchSnapshot();
  });

  it('records resolution of a complex branch name with slugification', async () => {
    const manager = createManager();
    const manifest = await manager.resolve({
      identifier: 'feature/big-change-v2',
      action: 'chat',
    });

    expect(normalize(manifest, harness.getHistory())).toMatchSnapshot();
  });

  it('records resolution of shorthand id:action syntax', async () => {
    const manager = createManager();
    const manifest = await manager.resolve({
      identifier: '456:experiment',
      action: 'chat',
    });

    expect(normalize(manifest, harness.getHistory())).toMatchSnapshot();
  });

  it('records resolution for GCE (Starfleet) providers', async () => {
    const manager = createManager({
      providerType: 'gce',
      instanceName: 'station-zeta',
      projectId: 'p1',
      zone: 'z1',
    });

    const manifest = await manager.resolve({
      identifier: 'st-1',
      action: 'chat',
    });

    expect(normalize(manifest, harness.getHistory())).toMatchSnapshot();
  });

  it('handles GitHub CLI failure gracefully (Phase 2)', async () => {
    harness.stub('gh', 'Error: Not found', 1);

    const manager = createManager();
    // Should fall back to using the ID as the branch name if lookup fails
    const manifest = await manager.resolve({
      identifier: '999',
      action: 'chat',
    });

    expect(normalize(manifest, harness.getHistory())).toMatchSnapshot();
  });
});

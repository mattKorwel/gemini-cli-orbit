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
import {
  normalizeBehaviorEnv,
  normalizeBehaviorHistory,
  normalizeBehaviorText,
} from '../test/BehaviorSnapshot.js';

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
    const snapshotOptions = {
      placeholders: {
        [harness.root]: '<tmp>',
        [process.cwd()]: '<cwd>',
      },
      volatileReplacements: [
        [/^\/tmp\/orbit-git-worktrees\//, '<tmp>/orbit-git-worktrees/'],
        [/.*\/Temp\/orbit-git-worktrees\//, '<tmp>/orbit-git-worktrees/'],
      ] as Array<[RegExp, string]>,
    };

    return {
      manifest: {
        ...manifest,
        bundleDir:
          typeof manifest.bundleDir === 'string'
            ? normalizeBehaviorText(manifest.bundleDir, snapshotOptions)
            : manifest.bundleDir,
        env: normalizeBehaviorEnv(manifest.env, snapshotOptions),
        mirrorPath:
          typeof manifest.mirrorPath === 'string'
            ? normalizeBehaviorText(manifest.mirrorPath, snapshotOptions)
            : manifest.mirrorPath,
        policyPath:
          typeof manifest.policyPath === 'string'
            ? normalizeBehaviorText(manifest.policyPath, snapshotOptions)
            : manifest.policyPath,
        tempDir:
          typeof manifest.tempDir === 'string'
            ? normalizeBehaviorText(manifest.tempDir, snapshotOptions)
            : manifest.tempDir,
        workDir:
          typeof manifest.workDir === 'string'
            ? normalizeBehaviorText(manifest.workDir, snapshotOptions)
            : manifest.workDir,
        workspaceName: normalizeBehaviorText(
          manifest.workspaceName || '',
          snapshotOptions,
        ),
      },
      history: normalizeBehaviorHistory(history, snapshotOptions),
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

  it('includes terminal identity env in resolved manifests', async () => {
    const originalTermProgram = process.env.TERM_PROGRAM;
    const originalTermProgramVersion = process.env.TERM_PROGRAM_VERSION;
    const originalWtSession = process.env.WT_SESSION;
    const originalTermSessionId = process.env.TERM_SESSION_ID;

    process.env.TERM_PROGRAM = 'WindowsTerminal';
    process.env.TERM_PROGRAM_VERSION = '1.22.11141.0';
    process.env.WT_SESSION = 'wt-123';
    process.env.TERM_SESSION_ID = 'term-456';

    try {
      const manager = createManager();
      const manifest = await manager.resolve({
        identifier: 'terminal-env',
        action: 'chat',
      });

      expect(manifest.env).toMatchObject({
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '3',
        TERM_PROGRAM: 'WindowsTerminal',
        TERM_PROGRAM_VERSION: '1.22.11141.0',
        WT_SESSION: 'wt-123',
        TERM_SESSION_ID: 'term-456',
      });
    } finally {
      if (originalTermProgram === undefined) delete process.env.TERM_PROGRAM;
      else process.env.TERM_PROGRAM = originalTermProgram;
      if (originalTermProgramVersion === undefined)
        delete process.env.TERM_PROGRAM_VERSION;
      else process.env.TERM_PROGRAM_VERSION = originalTermProgramVersion;
      if (originalWtSession === undefined) delete process.env.WT_SESSION;
      else process.env.WT_SESSION = originalWtSession;
      if (originalTermSessionId === undefined)
        delete process.env.TERM_SESSION_ID;
      else process.env.TERM_SESSION_ID = originalTermSessionId;
    }
  });
});

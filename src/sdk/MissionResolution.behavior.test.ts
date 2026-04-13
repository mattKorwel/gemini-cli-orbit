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
    const normalizePath = (p: string) => {
      if (typeof p !== 'string') return p;
      let res = p.replaceAll('\\', '/').replaceAll(rootPath, '<tmp>');
      // Also normalize /tmp/orbit-git-worktrees/ to <tmp>/orbit-git-worktrees/ if it appears in Linux
      res = res.replace(
        /^\/tmp\/orbit-git-worktrees\//,
        '<tmp>/orbit-git-worktrees/',
      );
      // And the Windows default C:/Users/.../Temp/orbit-git-worktrees/
      res = res.replace(
        /.*\/Temp\/orbit-git-worktrees\//,
        '<tmp>/orbit-git-worktrees/',
      );
      return res;
    };

    const normalizeEnv = (env: Record<string, string> | undefined) => {
      if (!env) return env;

      const filtered = { ...env };
      // Remove environment variables that fluctuate between platforms and sessions
      delete filtered.WT_SESSION;
      delete filtered.TERM_SESSION_ID;
      delete filtered.TERM_PROGRAM;
      delete filtered.TERM_PROGRAM_VERSION;
      delete filtered.SSH_AUTH_SOCK;
      delete filtered.SSH_CLIENT;
      delete filtered.SSH_CONNECTION;
      delete filtered.SSH_TTY;

      return filtered;
    };

    return {
      manifest: {
        ...manifest,
        bundleDir: normalizePath(manifest.bundleDir),
        env: normalizeEnv(manifest.env),
        mirrorPath: normalizePath(manifest.mirrorPath),
        policyPath: normalizePath(manifest.policyPath),
        tempDir: normalizePath(manifest.tempDir),
        workDir: normalizePath(manifest.workDir),
        workspaceName: (manifest.workspaceName || '').replaceAll('\\', '/'),
      },
      history: history.map((line) => {
        let res = line.replaceAll('\\', '/').replaceAll(rootPath, '<tmp>');
        // Normalize the absolute path to the current working directory as well
        const cwd = process.cwd().replaceAll('\\', '/');
        res = res.replaceAll(cwd, '<cwd>');
        return res;
      }),
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

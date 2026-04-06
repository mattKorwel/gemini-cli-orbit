/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Define mocks BEFORE any imports that might use them
vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    existsSync: vi.fn().mockImplementation(() => true),
    mkdirSync: vi.fn().mockImplementation(() => {}),
    readFileSync: vi.fn().mockReturnValue('{}'),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
  };
});

import { MissionManager } from './MissionManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { ConfigManager } from '../core/ConfigManager.js';
import { ContextResolver } from '../core/ContextResolver.js';
import { ProcessManager } from '../core/ProcessManager.js';

vi.mock('../core/ConfigManager.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    loadSettings: vi.fn().mockReturnValue({ repos: {} }),
    loadProjectConfig: vi.fn().mockReturnValue({}),
    loadJson: vi.fn().mockReturnValue(null),
    loadSchematic: vi.fn().mockReturnValue({}),
    detectRepoName: vi.fn().mockReturnValue('real-repo'),
  };
});

describe('Mission Resolve Integration', () => {
  const repoRoot = '/tmp/orbit-test-repo';

  const pm = new ProcessManager();
  const executors: any = {
    node: {
      create: vi.fn(),
      createRemote: vi.fn().mockReturnValue({ bin: 'node', args: [] }),
    },
    ssh: { create: vi.fn() },
    git: { fetch: vi.fn() },
    docker: { run: vi.fn(), stop: vi.fn(), remove: vi.fn() },
    tmux: { create: vi.fn() },
    gemini: { create: vi.fn() },
  };

  const createManager = async (flags: any = {}) => {
    const context = await ContextResolver.resolve({
      repoRoot,
      flags,
      env: {},
    });

    const factory = new ProviderFactory(pm, executors);
    const configManager = new ConfigManager();

    return new MissionManager(
      context.project,
      context.infra,
      { onLog: () => {}, onProgress: () => {} } as any,
      factory,
      configManager,
      pm,
      executors,
      { saveReceipt: () => {} } as any,
    );
  };

  describe('Local vs Remote Delegation', () => {
    it('Local: should resolve with hierarchical naming and local paths', async () => {
      const manager = await createManager({ projectId: 'local' });
      const manifest = await manager.resolve({
        identifier: '123',
        action: 'chat',
      });

      // LocalWorktreeProvider: hierarchical orbit-git-worktrees/<repo>/<id>
      expect(manifest.workDir).toMatch(/.*orbit-git-worktrees.real-repo.123/);

      // Local session name: <repo>/<id>
      expect(manifest.sessionName).toBe('real-repo/123');

      // Local container name: <repo>-<id>
      expect(manifest.containerName).toBe('real-repo-123');
    });

    it('Remote (GCE): should resolve with hierarchical naming and absolute remote paths', async () => {
      const manager = await createManager({
        projectId: 'gcp-project',
        zone: 'us-west1-a',
        instanceName: 'station-v1',
      });

      const manifest = await manager.resolve({
        identifier: '123',
        action: 'chat',
      });

      // GceCosProvider: hierarchical /mnt/disks/data/workspaces/<repo>/<id>
      expect(manifest.workDir).toBe('/mnt/disks/data/workspaces/real-repo/123');

      // Session Name: <repo>/<id>
      expect(manifest.sessionName).toBe('real-repo/123');
    });

    it('should correctly suffix non-chat actions for both providers', async () => {
      const local = await createManager({ projectId: 'local' });
      const remote = await createManager({ projectId: 'gcp', zone: 'z' });

      const localFix = await local.resolve({
        identifier: 'feat/test',
        action: 'fix',
      });
      const remoteFix = await remote.resolve({
        identifier: 'feat/test',
        action: 'fix',
      });

      // Local: suffix in session and container
      expect(localFix.sessionName).toBe('real-repo/feat-test/fix');
      expect(localFix.containerName).toBe('real-repo-feat-test-fix');

      // Remote: suffix in session and container
      expect(remoteFix.sessionName).toBe('real-repo/feat-test/fix');
      expect(remoteFix.containerName).toBe('real-repo-feat-test-fix');
    });
  });

  describe('Identification Parsing', () => {
    it('should resolve numeric IDs to headRefName from GitHub CLI', async () => {
      vi.spyOn(pm, 'runSync').mockReturnValue({
        status: 0,
        stdout: JSON.stringify({ headRefName: 'fix-bugs' }),
        stderr: '',
      });

      const manager = await createManager({ projectId: 'local' });
      const manifest = await manager.resolve({
        identifier: '888',
        action: 'chat',
      });

      expect(manifest.branchName).toBe('fix-bugs');
      expect(manifest.identifier).toBe('888');
    });

    it('should slugify branch names for naming but retain them for git', async () => {
      const manager = await createManager({ projectId: 'local' });
      const manifest = await manager.resolve({
        identifier: 'bugfix/critical-fix',
        action: 'chat',
      });

      // branchName is sanitized in the manifest for naming
      expect(manifest.branchName).toBe('bugfix-critical-fix');
      expect(manifest.containerName).toBe('real-repo-bugfix-critical-fix');
    });

    it('should handle mission suffixes (id:suffix)', async () => {
      const manager = await createManager({ projectId: 'local' });
      const manifest = await manager.resolve({
        identifier: '123:my-experiment',
        action: 'chat',
      });

      // idSlug becomes 123-my-experiment
      expect(manifest.containerName).toBe('real-repo-123-my-experiment');
      expect(manifest.sessionName).toBe('real-repo/123-my-experiment');
    });
  });
});

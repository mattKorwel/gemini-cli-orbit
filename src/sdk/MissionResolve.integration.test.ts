/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MissionManager } from './MissionManager.js';
import { ContextResolver } from '../core/ContextResolver.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { ProcessManager } from '../core/ProcessManager.js';
import { NodeExecutor } from '../core/executors/NodeExecutor.js';
import { GitExecutor } from '../core/executors/GitExecutor.js';
import { DockerExecutor } from '../core/executors/DockerExecutor.js';
import { TmuxExecutor } from '../core/executors/TmuxExecutor.js';
import { type IExecutors } from '../core/interfaces.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Mission Resolve Integration', () => {
  let tempDir: string;
  let pm: ProcessManager;
  let executors: IExecutors;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-resolve-test-'));
    pm = new ProcessManager();
    executors = {
      git: new GitExecutor(pm),
      docker: new DockerExecutor(pm),
      tmux: new TmuxExecutor(pm),
      node: new NodeExecutor(pm),
      gemini: { exec: () => ({ status: 0 }) } as any,
      ssh: { exec: vi.fn(), rsync: vi.fn(), create: vi.fn() } as any,
    };

    // Mock system calls
    vi.spyOn(pm, 'runSync').mockImplementation((bin, args) => {
      // Mock GitHub CLI for PR resolution
      if (bin === 'gh' && args.includes('pr') && args.includes('view')) {
        const prId = args[args.indexOf('view') + 1];
        return {
          status: 0,
          stdout: JSON.stringify({ headRefName: `feature/pr-${prId}` }),
          stderr: '',
        };
      }
      if (bin === 'git' && args.includes('remote')) {
        return {
          status: 0,
          stdout: 'https://github.com/real/repo.git',
          stderr: '',
        };
      }
      if (bin === 'which' && args.includes('tmux')) {
        return { status: 0, stdout: '/usr/bin/tmux', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const createManager = async (flags: any = {}, env: any = {}) => {
    const context = await ContextResolver.resolve({
      repoRoot: tempDir,
      flags: { repoName: 'real-repo', ...flags },
      env,
    });

    const factory = new ProviderFactory(pm, executors);

    const configManager: any = {
      detectRemoteUrl: () => 'https://github.com/real/repo.git',
      loadSettings: () => ({ repos: {} }),
      loadJson: () => null,
      loadSchematic: () => ({}),
    };

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

      // LocalWorktreeProvider: hierarchical workspacesDir/<repo>/<id>
      // We check that the path ends with real-repo/123 and contains the parent workspaces dir
      expect(manifest.workDir).toMatch(/.*workspaces.*real-repo.123/);

      // Local session name: <repo>/<id>
      expect(manifest.sessionName).toBe('real-repo/123');

      // Local container name: <repo>-<id>
      expect(manifest.containerName).toBe('real-repo-123');
    });

    it('Remote (GCE): should resolve with flat legacy naming and absolute remote paths', async () => {
      const manager = await createManager({
        projectId: 'gcp-project',
        zone: 'us-west1-a',
        instanceName: 'station-v1',
      });
      const manifest = await manager.resolve({
        identifier: '123',
        action: 'chat',
      });

      // GceCosProvider: flat /mnt/disks/data/workspaces/<repo>/orbit-<repo>-<id>
      expect(manifest.workDir).toBe(
        '/mnt/disks/data/workspaces/real-repo/orbit-real-repo-123',
      );

      // GCE session name: orbit/<repo>/<id>
      expect(manifest.sessionName).toBe('orbit/real-repo/123');

      // GCE container name: orbit-<repo>-<id>
      expect(manifest.containerName).toBe('orbit-real-repo-123');
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
      // branchName is sanitized, so feat/test becomes feat-test
      expect(localFix.sessionName).toBe('real-repo/feat-test/fix');
      expect(localFix.containerName).toBe('real-repo-feat-test-fix');

      // Remote: suffix in session and container
      expect(remoteFix.sessionName).toBe('orbit/real-repo/feat-test/fix');
      expect(remoteFix.containerName).toBe('orbit-real-repo-feat-test-fix');
    });
  });

  describe('Identification Parsing', () => {
    it('should resolve numeric IDs to headRefName from GitHub CLI', async () => {
      const manager = await createManager({ projectId: 'local' });
      const manifest = await manager.resolve({
        identifier: '888',
        action: 'chat',
      });

      // feature/pr-888 sanitized becomes feature-pr-888
      expect(manifest.branchName).toBe('feature-pr-888');
      expect(manifest.identifier).toBe('888');
    });

    it('should slugify branch names for naming but retain them for git', async () => {
      const manager = await createManager({ projectId: 'local' });
      // We pass a non-numeric ID so it doesn't trigger GH CLI
      const manifest = await manager.resolve({
        identifier: 'bugfix/critical-fix',
        action: 'chat',
      });

      // branchName is sanitized in the manifest
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

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { MissionManager } from './MissionManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { StationRegistry } from './StationRegistry.js';

describe('Mission Resolve Integration', () => {
  const mockPm: any = {
    runSync: vi.fn().mockImplementation((bin, args) => {
      if (bin === 'gh' && args.includes('view')) {
        return { status: 0, stdout: 'fix-bugs' };
      }
      return { status: 0, stdout: '', stderr: '' };
    }),
  };

  const mockExecutors = ProviderFactory.getExecutors(mockPm);
  const factory = new ProviderFactory(mockPm, mockExecutors);
  const configManager: any = {
    loadProjectConfig: vi.fn().mockReturnValue({}),
    loadSettings: vi.fn().mockReturnValue({}),
    loadSchematic: vi.fn(),
    detectRemoteUrl: vi.fn().mockReturnValue('http://git.real'),
  };
  const registry = new StationRegistry(factory, configManager);

  const createManager = (infra: any = {}) => {
    return new MissionManager(
      { repoRoot: '/repo', repoName: 'real-repo' },
      infra,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
      factory,
      configManager,
      mockPm,
      mockExecutors,
      registry,
    );
  };

  describe('Local vs Remote Delegation', () => {
    it('Local: should resolve with hierarchical naming and local paths', async () => {
      const manager = createManager({
        projectId: 'local',
        providerType: 'local-worktree',
      });
      const manifest = await manager.resolve({
        identifier: 'feat-1',
        action: 'chat',
      });

      expect(manifest.workspaceName).toBe('real-repo/feat-1');
      expect(manifest.containerName).toBe('real-repo-feat-1');
    });

    it('Remote (GCE): should resolve with hierarchical naming and absolute remote paths', async () => {
      const manager = createManager({
        projectId: 'p1',
        providerType: 'gce',
        workspacesDir: '/mnt/disks/data/workspaces',
      });
      const manifest = await manager.resolve({
        identifier: 'feat-1',
        action: 'chat',
      });

      expect(manifest.workDir).toBe(
        '/mnt/disks/data/workspaces/real-repo/feat-1',
      );
    });

    it('should correctly suffix non-chat actions for both providers', async () => {
      const manager = createManager({ providerType: 'local-worktree' });
      const manifest = await manager.resolve({
        identifier: 'feat-1',
        action: 'fix',
      });

      expect(manifest.containerName).toBe('real-repo-feat-1-fix');
      expect(manifest.sessionName).toBe('real-repo/feat-1/fix');
    });
  });

  describe('Identification Parsing', () => {
    it('should resolve numeric IDs to headRefName from GitHub CLI', async () => {
      const manager = createManager();
      const manifest = await manager.resolve({
        identifier: '888',
        action: 'chat',
      });

      expect(manifest.branchName).toBe('fix-bugs');
      expect(manifest.identifier).toBe('888');
    });

    it('should slugify branch names for naming but retain them for git', async () => {
      const manager = createManager();
      const manifest = await manager.resolve({
        identifier: 'bugfix/critical-fix',
        action: 'chat',
      });

      expect(manifest.branchName).toBe('bugfix/critical-fix');
      expect(manifest.containerName).toBe('real-repo-bugfix-critical-fix');
    });

    it('should handle mission suffixes (id:suffix)', async () => {
      const manager = createManager();
      const manifest = await manager.resolve({
        identifier: '123:my-experiment',
        action: 'chat',
      });

      // idSlug becomes 123
      expect(manifest.identifier).toBe('123');
      expect(manifest.action).toBe('my-experiment');
      expect(manifest.containerName).toBe('real-repo-123-my-experiment');
    });
  });
});

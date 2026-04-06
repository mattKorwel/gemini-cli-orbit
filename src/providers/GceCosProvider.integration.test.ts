/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GceCosProvider } from './GceCosProvider.js';
import {
  type ProjectContext,
  LOCAL_BUNDLE_PATH,
  BUNDLE_PATH,
} from '../core/Constants.js';

vi.mock('../core/Logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    logOutput: vi.fn(),
  },
}));

describe('GceCosProvider Regression Test: Bundle Sync', () => {
  const projectId = 'test-p';
  const zone = 'us-west1-a';
  const instanceName = 'test-i';
  const repoRoot = '/repo';
  const projectCtx: ProjectContext = {
    repoRoot,
    repoName: 'repo',
  };

  const mockSsh = {
    getMagicRemote: vi.fn().mockReturnValue('user@host'),
    runHostCommand: vi.fn(),
    syncPath: vi.fn().mockResolvedValue(0),
    syncPathIfChanged: vi.fn().mockResolvedValue(0),
    setOverrideHost: vi.fn(),
    runDockerExec: vi.fn(),
    getStandardUser: vi.fn().mockReturnValue('node'),
  };

  const mockPm: any = {
    runSync: vi.fn(),
  };

  let provider: GceCosProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GceCosProvider(
      projectCtx,
      projectId,
      zone,
      instanceName,
      repoRoot,
      mockSsh as any,
      mockPm,
      {} as any, // executors
      { projectId, zone, instanceName },
      { imageUri: 'test-image' },
    );
  });

  it('should sync the extension bundle to the remote host during ensureReady', async () => {
    // 1. Setup: Simulate a running station but missing bundle
    mockSsh.runHostCommand.mockImplementation(async (cmd) => {
      if (!cmd || !cmd.args) return { status: 0, stdout: '', stderr: '' };

      const fullCmd = cmd.args.join(' ');

      // Mock repo check
      if (fullCmd.includes('ls -d')) {
        return { status: 0, stdout: '/repo/.git', stderr: '' };
      }
      // Mock docker inspect (capsule exists and is running)
      if (fullCmd.includes('docker inspect')) {
        return { status: 0, stdout: 'true', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    });

    // 2. Act: Run ensureReady
    await provider.ensureReady();

    // 3. Assert: Verify that syncPathIfChanged was called for the bundle directory WITH a trailing slash
    expect(mockSsh.syncPathIfChanged).toHaveBeenCalledWith(
      `${LOCAL_BUNDLE_PATH}/`,
      BUNDLE_PATH,
      expect.objectContaining({ delete: true, sudo: true }),
    );
  });

  it('should throw an error if bundle sync fails', async () => {
    // 1. Setup: Simulate rsync failure (non-zero exit code)
    mockSsh.syncPathIfChanged.mockResolvedValue(1); // Error code

    // 2. Act & Assert: ensureReady should throw
    await expect(provider.ensureReady()).rejects.toThrow(
      'Failed to synchronize extension bundle',
    );
  });
});

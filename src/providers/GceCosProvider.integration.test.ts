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

describe('GceCosProvider Integration Logic', () => {
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
    getConnectionHandle: vi.fn().mockReturnValue('user@host'),
    exec: vi.fn(),
    sync: vi.fn().mockResolvedValue(0),
    setOverrideHost: vi.fn(),
    attach: vi.fn().mockResolvedValue(0),
    ensureTunnel: vi.fn().mockResolvedValue(undefined),
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

  describe('ensureReady & Sync', () => {
    it('should sync the extension bundle to the remote host during ensureReady', async () => {
      mockSsh.exec.mockResolvedValue({
        status: 0,
        stdout: 'true',
        stderr: '',
      });

      await provider.ensureReady();

      expect(mockSsh.sync).toHaveBeenCalledWith(
        `${LOCAL_BUNDLE_PATH}/`,
        BUNDLE_PATH,
        expect.objectContaining({ delete: true, sudo: true }),
      );
    });

    it('should return 255 if bundle sync fails', async () => {
      mockSsh.sync.mockResolvedValue(1);
      const res = await provider.ensureReady();
      expect(res).toBe(255);
    });
  });

  describe('getExecOutput Quoting Logic', () => {
    it('should wrap raw string commands in bash -c with proper quoting', async () => {
      const rawCmd = "echo 'hello world' && ls";
      await provider.getExecOutput(rawCmd);

      expect(mockSsh.exec).toHaveBeenCalledWith(
        expect.objectContaining({
          bin: '/bin/sh',
          args: ['-c', "echo 'hello world' && ls"],
        }),
        expect.anything(),
      );
    });

    it('should NOT double-wrap Command objects in bash -c', async () => {
      const cmdObj = { bin: 'node', args: ['bundle.js', 'start'] };
      await provider.getExecOutput(cmdObj);

      expect(mockSsh.exec).toHaveBeenCalledWith(
        expect.objectContaining({
          bin: 'node',
          args: ['bundle.js', 'start'],
        }),
        expect.anything(),
      );
    });

    it('should pass environment variables through to transport', async () => {
      await provider.getExecOutput('ls', { env: { FOO: 'bar' } });

      expect(mockSsh.exec).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({ FOO: 'bar' }),
        }),
        expect.anything(),
      );
    });

    it('should route to sudo docker exec if isolationId is provided', async () => {
      await provider.getExecOutput('ls', { isolationId: 'my-capsule' });

      expect(mockSsh.exec).toHaveBeenCalledWith(
        expect.stringContaining('sudo docker exec my-capsule'),
        expect.anything(),
      );
    });
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/Users/testuser',
  },
  homedir: () => '/Users/testuser',
}));

import { GceSSHManager } from './SSHManager.js';
import fs from 'node:fs';

vi.mock('node:fs');

describe('GceSSHManager', () => {
  const projectId = 'test-project';
  const zone = 'us-central1-a';
  const instanceName = 'test-instance';

  const mockPm: any = {
    runSync: vi.fn(),
    runAsync: vi.fn(),
    spawn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as any).mockReturnValue(true);
    (fs.statSync as any).mockReturnValue({ isDirectory: () => true });
    (fs.readdirSync as any).mockReturnValue([]);
    mockPm.runSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });
  });

  describe('syncPathIfChanged', () => {
    it('should skip sync if remote hash matches local', async () => {
      const manager = new GceSSHManager(
        projectId,
        zone,
        instanceName,
        {
          backendType: 'direct-internal',
        } as any,
        mockPm,
      );

      // 1. Mock directory content to produce a stable hash
      (fs.readdirSync as any).mockReturnValue(['file1.txt']);
      (fs.statSync as any).mockImplementation((p: string) => ({
        isFile: () => p.endsWith('.txt'),
        isDirectory: () => !p.endsWith('.txt'),
        size: 10,
      }));
      (fs.readFileSync as any).mockReturnValue(Buffer.from('content'));

      const localHash = (manager as any).generateDirectoryHash('/local/path');

      // 2. Mock remote 'cat' command to return the same hash
      mockPm.runSync.mockImplementation((bin: string, args: string[]) => {
        const lastArg = args[args.length - 1];
        if (bin === 'ssh' && lastArg && lastArg.includes('cat')) {
          return {
            status: 0,
            stdout: localHash,
            stderr: '',
          };
        }
        return { status: 0, stdout: '', stderr: '' };
      });

      const status = await manager.syncPathIfChanged(
        '/local/path',
        '/remote/path',
      );

      expect(status).toBe(0);

      // Verify rsync was NOT called
      const rsyncCall = mockPm.runSync.mock.calls.find(
        (call: any) => call[0] === 'rsync',
      );
      expect(rsyncCall).toBeUndefined();
    });

    it('should perform sync if remote hash differs', async () => {
      const manager = new GceSSHManager(
        projectId,
        zone,
        instanceName,
        {
          backendType: 'direct-internal',
        } as any,
        mockPm,
      );

      // 1. Mock remote 'cat' to return different hash (error 1)
      mockPm.runSync.mockImplementation((bin: string, args: string[]) => {
        const lastArg = args[args.length - 1];
        if (bin === 'ssh' && lastArg && lastArg.includes('cat')) {
          return {
            status: 1,
            stdout: '',
            stderr: 'No such file',
          };
        }
        return { status: 0, stdout: '', stderr: '' };
      });

      const status = await manager.syncPathIfChanged(
        '/local/path',
        '/remote/path',
      );

      expect(status).toBe(0);

      // 2. Verify rsync WAS called
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'rsync',
        expect.anything(),
        expect.anything(),
      );

      // 3. Verify remote hash was updated
      expect(mockPm.runSync).toHaveBeenCalledWith(
        'ssh',
        expect.arrayContaining([
          expect.stringContaining('echo'),
          expect.stringContaining('> /tmp/.orbit.path.hash'),
        ]),
        expect.anything(),
      );
    });
  });

  describe('getMagicRemote', () => {
    it('should use default internal suffix when no dnsSuffix provided', () => {
      const manager = new GceSSHManager(
        projectId,
        zone,
        instanceName,
        {
          backendType: 'direct-internal',
        } as any,
        mockPm,
      );

      const remote = manager.getMagicRemote();
      expect(remote).toContain(
        `nic0.${instanceName}.${zone}.c.${projectId}.internal`,
      );
    });

    it('should use custom dnsSuffix when provided', () => {
      const manager = new GceSSHManager(
        projectId,
        zone,
        instanceName,
        {
          backendType: 'direct-internal',
          dnsSuffix: 'internal.gcpnode.com',
        } as any,
        mockPm,
      );

      const remote = manager.getMagicRemote();
      expect(remote).toContain(
        `nic0.${instanceName}.${zone}.c.${projectId}.internal.gcpnode.com`,
      );
    });

    it('should handle dnsSuffix with leading dot', () => {
      const manager = new GceSSHManager(
        projectId,
        zone,
        instanceName,
        {
          backendType: 'direct-internal',
          dnsSuffix: '.internal.gcpnode.com',
        } as any,
        mockPm,
      );

      const remote = manager.getMagicRemote();
      expect(remote).toContain(
        `nic0.${instanceName}.${zone}.c.${projectId}.internal.gcpnode.com`,
      );
    });

    it('should include userSuffix if provided', () => {
      const manager = new GceSSHManager(
        projectId,
        zone,
        instanceName,
        {
          backendType: 'direct-internal',
          userSuffix: '_google_com',
        } as any,
        mockPm,
      );

      const remote = manager.getMagicRemote();
      const currentUser = process.env.USER || 'node';
      expect(remote).toMatch(new RegExp(`^${currentUser}_google_com@`));
    });

    it('should honor overrideHost if set', () => {
      const manager = new GceSSHManager(
        projectId,
        zone,
        instanceName,
        {
          backendType: 'direct-internal',
        } as any,
        mockPm,
      );

      manager.setOverrideHost('1.2.3.4');
      const remote = manager.getMagicRemote();
      const currentUser = process.env.USER || 'node';
      expect(remote).toBe(`${currentUser}@1.2.3.4`);
    });
  });
});

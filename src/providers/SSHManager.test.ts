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
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

vi.mock('node:child_process');
vi.mock('node:fs');

describe('GceSSHManager', () => {
  const projectId = 'test-project';
  const zone = 'us-central1-a';
  const instanceName = 'test-instance';

  beforeEach(() => {
    vi.clearAllMocks();
    (fs.existsSync as any).mockReturnValue(true);
    (fs.statSync as any).mockReturnValue({ isDirectory: () => true });
    (fs.readdirSync as any).mockReturnValue([]);
  });

  describe('syncPathIfChanged', () => {
    it('should skip sync if remote hash matches local', async () => {
      const manager = new GceSSHManager(projectId, zone, instanceName, {
        backendType: 'direct-internal',
      });

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
      (spawnSync as any).mockImplementation((bin: string, args: string[]) => {
        const lastArg = args[args.length - 1];
        if (bin === 'ssh' && lastArg && lastArg.includes('cat')) {
          return {
            status: 0,
            stdout: Buffer.from(localHash),
            stderr: Buffer.from(''),
          };
        }
        return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') };
      });

      const status = await manager.syncPathIfChanged(
        '/local/path',
        '/remote/path',
      );

      expect(status).toBe(0);

      // Verify rsync was NOT called
      const rsyncCall = (spawnSync as any).mock.calls.find(
        (call: any) => call[0] === 'rsync',
      );
      expect(rsyncCall).toBeUndefined();
    });

    it('should perform sync if remote hash differs', async () => {
      const manager = new GceSSHManager(projectId, zone, instanceName, {
        backendType: 'direct-internal',
      });

      // 1. Mock remote 'cat' to return different hash (error 1)
      (spawnSync as any).mockImplementation((bin: string, args: string[]) => {
        const lastArg = args[args.length - 1];
        if (bin === 'ssh' && lastArg && lastArg.includes('cat')) {
          return {
            status: 1,
            stdout: Buffer.from(''),
            stderr: Buffer.from('No such file'),
          };
        }
        return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') };
      });

      const status = await manager.syncPathIfChanged(
        '/local/path',
        '/remote/path',
      );

      expect(status).toBe(0);

      // 2. Verify rsync WAS called
      expect(spawnSync).toHaveBeenCalledWith(
        'rsync',
        expect.anything(),
        expect.anything(),
      );

      // 3. Verify remote hash was updated
      expect(spawnSync).toHaveBeenCalledWith(
        'ssh',
        expect.arrayContaining([
          expect.stringContaining('echo'),
          expect.stringContaining('> /tmp/.orbit.path.hash'),
        ]),
        expect.anything(),
      );
    });
  });
});

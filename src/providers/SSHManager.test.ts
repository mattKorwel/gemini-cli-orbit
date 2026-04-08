/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GceSSHManager } from './SSHManager.js';

vi.mock('../core/Logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    logOutput: vi.fn(),
  },
}));

describe('GceSSHManager', () => {
  const projectId = 'test-p';
  const zone = 'us-west1-a';
  const instanceName = 'test-i';
  const infra = { projectId, zone, instanceName } as any;

  const mockPm: any = {
    runSync: vi.fn(),
    runAsync: vi.fn(),
  };

  const mockSsh: any = {
    exec: vi.fn(),
    execAsync: vi.fn(),
    create: vi.fn(),
    rsync: vi.fn(),
  };

  let manager: GceSSHManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new GceSSHManager(
      projectId,
      zone,
      instanceName,
      infra,
      mockPm,
      mockSsh,
    );
  });

  describe('commandToString Quoting', () => {
    it('should properly quote arguments with spaces', async () => {
      // Accessing private method for testing
      const cmd: any = {
        bin: 'ls',
        args: ['folder name', 'file.txt'],
      };

      const result = (manager as any).commandToString(cmd);
      expect(result).toBe("ls 'folder name' 'file.txt'");
    });

    it('should properly quote arguments with nested single quotes', async () => {
      const cmd: any = {
        bin: 'echo',
        args: ["it's a trap"],
      };

      const result = (manager as any).commandToString(cmd);
      expect(result).toBe("echo 'it'\\''s a trap'");
    });

    it('should include environment variables with quoting', async () => {
      const cmd: any = {
        bin: 'ls',
        args: [],
        env: { FOO: 'bar baz' },
      };

      const result = (manager as any).commandToString(cmd);
      expect(result).toBe("FOO='bar baz' ls ");
    });
  });

  describe('runHostCommand', () => {
    it('should call execAsync and process result', async () => {
      mockSsh.execAsync.mockResolvedValue({
        status: 0,
        stdout: 'hello',
        stderr: '',
      });

      const res = await manager.runHostCommand({ bin: 'echo', args: ['hi'] });
      expect(res.stdout).toBe('hello');
      expect(mockSsh.execAsync).toHaveBeenCalled();
    });
  });
});

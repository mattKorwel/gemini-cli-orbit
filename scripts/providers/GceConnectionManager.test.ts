/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GceConnectionManager } from './GceConnectionManager.ts';
import { spawnSync } from 'child_process';
import os from 'os';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

describe('GceConnectionManager', () => {
  const projectId = 'test-project';
  const zone = 'us-west1-a';
  const instanceName = 'test-instance';
  let manager: GceConnectionManager;

  beforeEach(() => {
    vi.resetAllMocks();
    manager = new GceConnectionManager(projectId, zone, instanceName);
  });

  it('should generate the correct magic remote string', () => {
    const remote = manager.getMagicRemote();
    const user = `${process.env.USER || 'node'}_google_com`;
    expect(remote).toBe(`${user}@nic0.test-instance.us-west1-a.c.test-project.internal.gcpnode.com`);
  });

  it('should generate a valid SSH run command', () => {
    const cmd = manager.getRunCommand('ls -la');
    expect(cmd).toContain('ssh');
    expect(cmd).toContain('StrictHostKeyChecking=no');
    expect(cmd).toContain('ls -la');
  });

  it('should execute a command via spawnSync', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: Buffer.from('hello world'),
      stderr: Buffer.from(''),
    } as any);

    const res = manager.run('echo hello');
    
    expect(spawnSync).toHaveBeenCalled();
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('hello world');
  });

  it('should handle rsync with correct flags', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);

    const res = manager.sync('/local/path', '/remote/path', { delete: true });
    
    expect(res).toBe(0);
    const lastCall = vi.mocked(spawnSync).mock.calls[0][0] as string;
    expect(lastCall).toContain('rsync');
    expect(lastCall).toContain('--delete');
    expect(lastCall).toContain('/local/path');
    expect(lastCall).toContain('/remote/path');
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GceConnectionManager } from './GceConnectionManager.js';
import { spawnSync } from 'child_process';

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
  });

  it('should generate correct internal magic remote', () => {
    manager = new GceConnectionManager(projectId, zone, instanceName, {
      backendType: 'direct-internal',
      dnsSuffix: '.gcpnode.com',
    });
    const remote = manager.getMagicRemote();
    const user = `${process.env.USER || 'node'}`;
    expect(remote).toBe(
      `${user}@nic0.${instanceName}.${zone}.c.${projectId}.internal.gcpnode.com`,
    );
  });

  it('should support user suffix for corporate identities', () => {
    manager = new GceConnectionManager(projectId, zone, instanceName, {
      userSuffix: '_google_com',
    });
    const remote = manager.getMagicRemote();
    const user = `${process.env.USER || 'node'}_google_com`;
    expect(remote).toContain(user);
  });

  it('should generate IAP gcloud command', () => {
    manager = new GceConnectionManager(projectId, zone, instanceName, {
      backendType: 'iap',
    });
    const cmd = manager.getRunCommand('uptime');
    expect(cmd).toContain('gcloud compute ssh');
    expect(cmd).toContain('--tunnel-through-iap');
    expect(cmd).toContain(instanceName);
  });

  it('should handle rsync with IAP backend', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
    manager = new GceConnectionManager(projectId, zone, instanceName, {
      backendType: 'iap',
    });

    manager.sync('/local', '/remote');
    const firstArg = vi.mocked(spawnSync).mock.calls[0]![0] as string;
    const secondArg = vi.mocked(spawnSync).mock.calls[0]![1] as string[];

    expect(firstArg).toBe('rsync');
    const sshArg = secondArg.find((a) => a.includes('gcloud compute ssh'));
    expect(sshArg).toBeDefined();
    expect(sshArg).toContain('--tunnel-through-iap');
  });
});

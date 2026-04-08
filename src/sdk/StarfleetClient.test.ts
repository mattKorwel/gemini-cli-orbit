/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StarfleetClient } from './StarfleetClient.js';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

describe('StarfleetClient Integration', () => {
  let daemon: ChildProcess;
  const client = new StarfleetClient('http://localhost:8081');

  beforeAll(async () => {
    // Start the daemon on a test port
    const serverPath = path.resolve('bundle/orbit-server.js');
    daemon = spawn('node', [serverPath], {
      env: { ...process.env, ORBIT_SERVER_PORT: '8081', NO_SUDO: '1' },
    });

    // Wait for it to wake up
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(() => {
    daemon.kill();
  });

  it('should ping the daemon successfully', async () => {
    const alive = await client.ping();
    expect(alive).toBe(true);
  });

  it('should send a valid mission manifest', async () => {
    const res = await client.launchMission({
      identifier: 'test-123',
      repoName: 'test-repo',
      branchName: 'main',
      action: 'chat',
      workspaceName: 'test/123',
      workDir: '/tmp/test',
      containerName: 'orbit-test-busybox',
      policyPath: '/tmp/pol',
      sessionName: 'test/123',
      upstreamUrl: 'https://github.com/test.git',
      image: 'busybox',
    } as any);

    expect(res.status).toBe('ACCEPTED');
  });
});

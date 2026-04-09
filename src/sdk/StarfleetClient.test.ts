/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StarfleetClient } from './StarfleetClient.js';
import http from 'node:http';

describe('StarfleetClient Integration', () => {
  let server: http.Server;
  const client = new StarfleetClient('http://localhost:8081');

  beforeAll(async () => {
    // Start a mock server on a test port
    server = http.createServer(async (req, res) => {
      const { method, url } = req;

      if (url === '/health' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'OK' }));
        return;
      }

      if (url === '/missions' && method === 'POST') {
        // Just return success for test
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ACCEPTED',
            receipt: { missionId: 'test-123', containerName: 'orbit-test-123' },
          }),
        );
        return;
      }

      res.writeHead(404).end();
    });

    await new Promise<void>((resolve) => {
      server.listen(8081, '127.0.0.1', () => resolve());
    });
  });

  afterAll(() => {
    server.close();
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
      containerName: 'orbit-test-123',
      policyPath: '/tmp/pol',
      sessionName: 'test/123',
      upstreamUrl: 'https://github.com/test.git',
      image: 'busybox',
    } as any);

    expect(res.status).toBe('ACCEPTED');
    expect(res.receipt).toBeDefined();
    expect(res.receipt.missionId).toBe('test-123');
    expect(res.receipt.containerName).toBe('orbit-test-123');
  });
});

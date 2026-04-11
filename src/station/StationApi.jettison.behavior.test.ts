/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StarfleetHarness } from '../test/StarfleetHarness.js';
import { createStationServer } from './StationApi.js';
import { StarfleetClient } from '../sdk/StarfleetClient.js';

describe('Station API Jettison Behavior', () => {
  let harness: StarfleetHarness;

  beforeEach(() => {
    harness = new StarfleetHarness('StationApiJettison');
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('records DELETE /missions/:id through docker rm', async () => {
    const orbitRoot = harness.resolve('orbit');

    harness.stub('docker', 'removed');

    const config: any = {
      port: 0,
      hostRoot: orbitRoot,
      storage: { workspacesRoot: '/orbit/workspaces' },
      mounts: [],
      areas: {},
    };

    const processManager = harness.createProcessManager();
    const server = createStationServer({
      config,
      processManager,
      debugLog: () => {},
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to bind station API test server');
      }

      const client = new StarfleetClient(`http://127.0.0.1:${address.port}`);
      const exitCode = await client.jettisonMission('test-mission');

      expect(exitCode).toBe(0);
      const history = harness
        .getHistory()
        .map((line) => line.replaceAll('\\', '/'));
      expect(history).toContainEqual(
        expect.stringContaining('docker rm --force test-mission'),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});

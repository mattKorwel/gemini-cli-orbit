/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { StarfleetHarness } from '../test/StarfleetHarness.js';
import { createStationServer } from './StationApi.js';
import { StarfleetClient } from '../sdk/StarfleetClient.js';

describe('Station API Behavior', () => {
  let harness: StarfleetHarness;

  beforeEach(() => {
    harness = new StarfleetHarness('StationApi');
  });

  afterEach(() => {
    harness.cleanup();
  });

  it(
    'records POST /missions through worker docker run',
    { timeout: 15000 },
    async () => {
      const orbitRoot = harness.resolve('orbit');
      const devShmRoot = harness.resolve('dev-shm');
      const workerStatePath = path.join(
        orbitRoot,
        'workspaces',
        'test-repo',
        'api-123',
        '.gemini',
        'orbit',
        'state.json',
      );
      fs.mkdirSync(path.join(orbitRoot, 'bundle'), { recursive: true });
      fs.mkdirSync(path.join(orbitRoot, '.gemini', 'policies'), {
        recursive: true,
      });
      fs.mkdirSync(path.join(orbitRoot, 'home', '.gemini'), {
        recursive: true,
      });
      fs.mkdirSync(path.join(orbitRoot, 'manifests'), { recursive: true });
      fs.mkdirSync(path.join(orbitRoot, 'workspaces'), { recursive: true });
      fs.mkdirSync(path.dirname(workerStatePath), { recursive: true });
      fs.writeFileSync(workerStatePath, JSON.stringify({ status: 'IDLE' }));
      fs.mkdirSync(devShmRoot, { recursive: true });
      fs.writeFileSync(
        path.join(orbitRoot, 'starfleet-entrypoint.sh'),
        '#!/bin/sh\nexit 0\n',
      );

      harness.stub('git', '');
      harness.stubScript(
        'docker',
        `
if (args[0] === 'run') {
  const statePath = ${JSON.stringify(workerStatePath)};
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({ status: 'IDLE' }));
  process.stdout.write('fake-container-id\\n');
  process.exit(0);
}

process.exit(0);
`,
      );

      const config: any = {
        port: 0,
        workerImage: 'test-worker-image',
        workerUser: 'root',
        manifestRoot: '/dev/shm',
        hostRoot: orbitRoot,
        isUnlocked: true,
        useSudo: false,
        storage: {
          workspacesRoot: '/orbit/workspaces',
          mirrorPath: '/orbit/main',
        },
        mounts: [
          { host: orbitRoot, capsule: '/orbit' },
          { host: devShmRoot, capsule: '/dev/shm' },
        ],
        areas: {
          orbitRoot: {
            host: orbitRoot,
            capsule: '/orbit',
            kind: 'dir',
          },
          manifests: {
            host: path.join(orbitRoot, 'manifests'),
            capsule: '/orbit/manifests',
            kind: 'dir',
          },
          bundle: {
            host: path.join(orbitRoot, 'bundle'),
            capsule: '/orbit/bundle',
            kind: 'dir',
            readonly: true,
          },
          globalGemini: {
            host: path.join(orbitRoot, 'home', '.gemini'),
            capsule: '/orbit/home/.gemini',
            kind: 'dir',
            readonly: true,
          },
          policies: {
            host: path.join(orbitRoot, '.gemini', 'policies'),
            capsule: '/orbit/.gemini/policies',
            kind: 'dir',
            readonly: true,
          },
          entrypoint: {
            host: path.join(orbitRoot, 'starfleet-entrypoint.sh'),
            capsule: '/orbit/starfleet-entrypoint.sh',
            kind: 'file',
            readonly: true,
          },
        },
        bundlePath: '/orbit/bundle',
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

        const response = await client.launchMission({
          identifier: 'api-123',
          repoName: 'test-repo',
          branchName: 'main',
          action: 'chat',
          workspaceName: 'test-repo/api-123',
          workDir: '/orbit/workspaces/test-repo/api-123',
          containerName: 'orbit-api-123',
          policyPath: '/orbit/.gemini/policies/workspace-policy.toml',
          sessionName: 'test-repo/api-123/chat',
          upstreamUrl: 'https://github.com/org/repo.git',
          mirrorPath: '/orbit/main',
          bundleDir: '/orbit/bundle',
          env: {
            SAMPLE_FLAG: '1',
          },
          sensitiveEnv: {
            SECRET_TOKEN: 'hidden-value',
          },
        } as any);

        const normalizedHistory = harness.getHistory().map((line) =>
          line
            .replaceAll('\\', '/')
            .replaceAll(process.cwd().replaceAll('\\', '/'), '<cwd>')
            .replaceAll(orbitRoot.replaceAll('\\', '/'), '<tmp>/orbit')
            .replaceAll(devShmRoot.replaceAll('\\', '/'), '<tmp>/dev-shm')
            .replace(/orbit-api-123-\d+/g, 'orbit-api-123-<ts>')
            .replace(
              /orbit-manifest-api-123-\d+\.json/g,
              'orbit-manifest-api-123-<ts>.json',
            )
            .replace(
              /\.orbit-env-orbit-api-123-\d+/g,
              '.orbit-env-orbit-api-123-<ts>',
            ),
        );

        const normalizedResponse = {
          status: response.status,
          receipt: {
            ...response.receipt,
            containerName: response.receipt.containerName.replace(
              /-\d+$/,
              '-<ts>',
            ),
            ignitedAt: '<iso>',
          },
        };

        expect({
          response: normalizedResponse,
          history: normalizedHistory,
        }).toMatchSnapshot();
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      }
    },
  );
});

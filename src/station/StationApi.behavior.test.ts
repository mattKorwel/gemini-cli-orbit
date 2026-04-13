/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { StarfleetHarness } from '../test/StarfleetHarness.js';
import { normalizeBehaviorHistory } from '../test/BehaviorSnapshot.js';
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
        manifestRoot: path.join(orbitRoot, 'manifests'),
        hostRoot: orbitRoot,
        isUnlocked: true,
        useSudo: false,
        storage: {
          workspacesRoot: path.join(orbitRoot, 'workspaces'),
          mirrorPath: path.join(orbitRoot, 'main'),
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
          workspaces: {
            host: path.join(orbitRoot, 'workspaces'),
            capsule: '/orbit/workspaces',
            kind: 'dir',
          },
          main: {
            host: path.join(orbitRoot, 'main'),
            capsule: '/orbit/main',
            kind: 'dir',
          },
          homeRoot: {
            host: path.join(orbitRoot, 'home'),
            capsule: '/orbit/home',
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
          geminiAuthFiles: {
            googleAccountsJson: '{"active":"test-account"}',
            geminiCredentialsJson: '{"refreshToken":"secret-refresh"}',
          },
        } as any);

        const secretFiles = fs
          .readdirSync(devShmRoot)
          .filter((entry) => entry.startsWith('.orbit-env-orbit-api-123-'));
        expect(secretFiles).toHaveLength(1);
        const secretContent = fs.readFileSync(
          path.join(devShmRoot, secretFiles[0]!),
          'utf8',
        );

        const normalizedHistory = normalizeBehaviorHistory(
          harness.getHistory(),
          {
            placeholders: {
              [process.cwd()]: '<cwd>',
              [orbitRoot]: '<tmp>/orbit',
              [devShmRoot]: '<tmp>/dev-shm',
            },
            volatileReplacements: [
              [/orbit-api-123-\d+/g, 'orbit-api-123-<ts>'],
              [
                /orbit-manifest-api-123-\d+\.json/g,
                'orbit-manifest-api-123-<ts>.json',
              ],
              [
                /\.orbit-env-orbit-api-123-\d+/g,
                '.orbit-env-orbit-api-123-<ts>',
              ],
            ],
          },
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
        expect(secretContent).toContain("export SECRET_TOKEN='hidden-value'");
        expect(secretContent).toContain(
          'export GCLI_ORBIT_GEMINI_ACCOUNTS_JSON_B64=',
        );
        expect(secretContent).toContain(
          'export GCLI_ORBIT_GEMINI_CREDENTIALS_JSON_B64=',
        );
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      }
    },
  );

  it(
    'syncs Gemini settings into the station home and mounts the station-local Gemini directory',
    { timeout: 15000 },
    async () => {
      const orbitRoot = harness.resolve('orbit');
      const devShmRoot = harness.resolve('dev-shm');
      const settingsPath = path.join(
        orbitRoot,
        'home',
        '.gemini',
        'settings.json',
      );
      const workerStatePath = path.join(
        orbitRoot,
        'workspaces',
        'test-repo',
        'settings-link',
        '.gemini',
        'orbit',
        'state.json',
      );

      fs.mkdirSync(path.join(orbitRoot, 'bundle'), { recursive: true });
      fs.mkdirSync(path.join(orbitRoot, '.gemini', 'policies'), {
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
        manifestRoot: path.join(orbitRoot, 'manifests'),
        hostRoot: orbitRoot,
        isUnlocked: true,
        useSudo: false,
        storage: {
          workspacesRoot: path.join(orbitRoot, 'workspaces'),
          mirrorPath: path.join(orbitRoot, 'main'),
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
          workspaces: {
            host: path.join(orbitRoot, 'workspaces'),
            capsule: '/orbit/workspaces',
            kind: 'dir',
          },
          main: {
            host: path.join(orbitRoot, 'main'),
            capsule: '/orbit/main',
            kind: 'dir',
          },
          homeRoot: {
            host: path.join(orbitRoot, 'home'),
            capsule: '/orbit/home',
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

        const settingsContent = JSON.stringify(
          { ui: { theme: 'test' }, hooks: { enabled: true } },
          null,
          2,
        );
        await client.syncGeminiSettings({
          hash: crypto
            .createHash('sha256')
            .update(settingsContent)
            .digest('hex'),
          content: settingsContent,
        });

        await client.launchMission({
          identifier: 'settings-link',
          repoName: 'test-repo',
          branchName: 'main',
          action: 'chat',
          workspaceName: 'test-repo/settings-link',
          workDir: '/orbit/workspaces/test-repo/settings-link',
          containerName: 'orbit-settings-link',
          policyPath: '/orbit/.gemini/policies/workspace-policy.toml',
          sessionName: 'test-repo/settings-link/chat',
          upstreamUrl: 'https://github.com/org/repo.git',
          mirrorPath: '/orbit/main',
          bundleDir: '/orbit/bundle',
        } as any);

        const normalizedHistory = normalizeBehaviorHistory(
          harness.getHistory(),
          {
            placeholders: {
              [process.cwd()]: '<cwd>',
              [orbitRoot]: '<tmp>/orbit',
              [devShmRoot]: '<tmp>/dev-shm',
            },
            volatileReplacements: [
              [/orbit-settings-link-\d+/g, 'orbit-settings-link-<ts>'],
              [
                /orbit-manifest-settings-link-\d+\.json/g,
                'orbit-manifest-settings-link-<ts>.json',
              ],
            ],
          },
        );

        const runLine = normalizedHistory.find((line) =>
          line.includes('docker run'),
        );

        expect(fs.readFileSync(settingsPath, 'utf8')).toBe(settingsContent);
        expect(runLine).toContain('-v <tmp>/orbit/home:/orbit/home');
        expect(runLine).toContain(
          '-v <tmp>/orbit/home/.gemini:/orbit/home/.gemini',
        );
        expect(runLine).not.toContain('/orbit/home/.gemini/settings.json:ro');
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      }
    },
  );

  it('handles launch failure when docker run fails', async () => {
    const orbitRoot = harness.resolve('orbit');
    harness.stub('docker', 'error message', 1);

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

      await expect(
        client.launchMission({
          identifier: 'fail-123',
          repoName: 'test-repo',
          branchName: 'main',
          action: 'chat',
          workspaceName: 'test-repo/fail-123',
          workDir: '/orbit/workspaces/test-repo/fail-123',
          containerName: 'fail-cont',
          policyPath: '/orbit/.gemini/policies/workspace-policy.toml',
          sessionName: 'test-repo/fail-123/chat',
          upstreamUrl: 'https://github.com/org/repo.git',
          mirrorPath: '/orbit/main',
          bundleDir: '/orbit/bundle',
        } as any),
      ).rejects.toThrow(
        /MISSION_LAUNCH_FAILED|Failed to start mission container/,
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});

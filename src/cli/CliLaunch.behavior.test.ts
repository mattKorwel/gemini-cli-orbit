/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { StarfleetHarness } from '../test/StarfleetHarness.js';
import { createStationServer } from '../station/StationApi.js';
import { logger } from '../core/Logger.js';

let activeBinDir = '';

vi.mock('../core/ProcessManager.js', async () => {
  const actual = await vi.importActual<
    typeof import('../core/ProcessManager.js')
  >('../core/ProcessManager.js');
  const testActual = await vi.importActual<
    typeof import('../test/TestProcessManager.js')
  >('../test/TestProcessManager.js');

  class BehaviorProcessManager extends testActual.TestProcessManager {
    constructor(defaultOptions: any = {}, useSudo = false) {
      super(new actual.ProcessManager(defaultOptions, useSudo), {
        binDir: activeBinDir,
      });
    }

    static runSync(bin: string, args: string[], options: any = {}) {
      return new BehaviorProcessManager().runSync(bin, args, options);
    }

    static runAsync(bin: string, args: string[], options: any = {}) {
      return new BehaviorProcessManager().runAsync(bin, args, options);
    }
  }

  return {
    ...actual,
    ProcessManager: BehaviorProcessManager,
  };
});

describe('CLI Launch Behavior', () => {
  let harness: StarfleetHarness;
  let originalCwd: string;

  beforeEach(() => {
    harness = new StarfleetHarness('CliLaunch');
    activeBinDir = harness.bin;
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    logger.setRepoRoot(originalCwd);
    await new Promise((resolve) => setTimeout(resolve, 50));
    activeBinDir = '';
    vi.resetModules();
    vi.unstubAllEnvs();
    harness.cleanup();
  });

  it(
    'records orbit mission launch through the API and worker docker run',
    { timeout: 15000 },
    async () => {
      const repoRoot = harness.resolve('repo');
      const orbitRoot = path.join(repoRoot, 'orbit-test-run');
      const devShmRoot = harness.resolve('dev-shm');
      const workerStatePath = path.join(
        orbitRoot,
        'workspaces',
        'test-repo',
        'cli-123',
        '.gemini',
        'orbit',
        'state.json',
      );

      fs.mkdirSync(path.join(repoRoot, '.gemini', 'orbit'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(repoRoot, '.gemini', 'orbit', 'config.json'),
        '{}',
      );
      fs.mkdirSync(path.join(repoRoot, 'bundle'), { recursive: true });
      fs.mkdirSync(path.join(repoRoot, '.gemini', 'policies'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(repoRoot, 'starfleet-entrypoint.sh'),
        '#!/bin/sh\nexit 0\n',
      );
      fs.mkdirSync(path.join(orbitRoot, 'manifests'), { recursive: true });
      fs.mkdirSync(path.join(orbitRoot, 'workspaces'), { recursive: true });
      fs.mkdirSync(path.join(orbitRoot, 'bundle'), { recursive: true });
      fs.mkdirSync(path.join(orbitRoot, '.gemini', 'policies'), {
        recursive: true,
      });
      fs.mkdirSync(path.join(orbitRoot, 'home', '.gemini'), {
        recursive: true,
      });
      fs.mkdirSync(path.dirname(workerStatePath), { recursive: true });
      fs.writeFileSync(workerStatePath, JSON.stringify({ status: 'IDLE' }));
      fs.mkdirSync(devShmRoot, { recursive: true });

      harness.stubScript(
        'git',
        `
const joined = args.join(' ');
if (joined === 'remote get-url origin') {
  process.stdout.write('https://github.com/org/test-repo.git\\n');
  process.exit(0);
}
if (joined === 'rev-parse --show-toplevel') {
  process.stdout.write(${JSON.stringify(repoRoot)} + '\\n');
  process.exit(0);
}
if (joined === 'rev-parse --abbrev-ref HEAD') {
  process.stdout.write('main\\n');
  process.exit(0);
}
process.exit(0);
`,
      );
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
if (args[0] === 'exec') {
  process.exit(0);
}
if (args[0] === 'ps' || args[0] === 'logs' || args[0] === 'rm') {
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
            host: path.join(repoRoot, 'bundle'),
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
            host: path.join(repoRoot, '.gemini', 'policies'),
            capsule: '/orbit/.gemini/policies',
            kind: 'dir',
            readonly: true,
          },
          entrypoint: {
            host: path.join(repoRoot, 'starfleet-entrypoint.sh'),
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
          throw new Error('Failed to bind CLI behavior station server');
        }

        fs.writeFileSync(
          path.join(repoRoot, '.gemini', 'orbit', 'config.json'),
          JSON.stringify({
            apiUrl: `http://127.0.0.1:${address.port}`,
          }),
        );

        vi.stubEnv('GCLI_ORBIT_REPO_NAME', 'test-repo');

        const { dispatch } = await import('./cli.js');
        const exitCode = await dispatch([
          '--repo-dir',
          repoRoot,
          'mission',
          'launch',
          'cli-123',
          'review',
          '--local-docker',
          '--git-auth',
          'none',
          '--gemini-auth',
          'none',
        ]);

        const normalizedHistory = harness.getHistory().map((line) =>
          line
            .replaceAll('\\', '/')
            .replaceAll(process.cwd().replaceAll('\\', '/'), '<cwd>')
            .replaceAll(repoRoot.replaceAll('\\', '/'), '<tmp>/repo')
            .replaceAll(
              orbitRoot.replaceAll('\\', '/'),
              '<tmp>/repo/orbit-test-run',
            )
            .replaceAll(devShmRoot.replaceAll('\\', '/'), '<tmp>/dev-shm')
            .replace(/orbit-cli-123-\d+/g, 'orbit-cli-123-<ts>')
            .replace(
              /orbit-manifest-cli-123-\d+\.json/g,
              'orbit-manifest-cli-123-<ts>.json',
            ),
        );

        expect({
          exitCode,
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

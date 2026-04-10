/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LocalDockerStarfleetProvider } from './LocalDockerStarfleetProvider.js';
import { ProviderFactory } from './ProviderFactory.js';
import { StarfleetHarness } from '../test/StarfleetHarness.js';

describe('Local Docker Starfleet Provider Behavior', () => {
  let harness: StarfleetHarness;

  beforeEach(() => {
    harness = new StarfleetHarness('LocalDockerProvider');
  });

  afterEach(() => {
    harness.cleanup();
  });

  it(
    'rebuilds and validates the local worker image when gemini is missing',
    { timeout: 15000 },
    async () => {
      const repoRoot = harness.resolve('repo');
      fs.mkdirSync(path.join(repoRoot, 'configs'), { recursive: true });
      fs.writeFileSync(
        path.join(repoRoot, 'configs', 'station.local.json'),
        JSON.stringify({
          workerImage: 'orbit-worker:local',
        }),
      );

      harness.stubScript(
        'docker',
        `
const markerPath = path.join(root, 'gemini-ready');
const joined = args.join(' ');

if (joined === 'image inspect orbit-worker:local') {
  process.stdout.write('[]\\n');
  process.exit(0);
}

if (joined === 'run --rm --entrypoint /usr/local/share/npm-global/bin/gemini orbit-worker:local --version') {
  if (fs.existsSync(markerPath)) {
    process.stdout.write('gemini 0.0.0-test\\n');
    process.exit(0);
  }
  process.stderr.write('exec: gemini: not found\\n');
  process.exit(1);
}

if (joined === 'build -t orbit-worker:local -f orbit-worker.Dockerfile .') {
  fs.writeFileSync(markerPath, 'ready');
  process.stdout.write('built\\n');
  process.exit(0);
}

process.exit(0);
`,
      );

      const processManager = harness.createProcessManager();
      const provider = new LocalDockerStarfleetProvider(
        {
          ping: vi.fn().mockResolvedValue(true),
          setBaseUrl: vi.fn(),
        } as any,
        {
          type: 'identity',
          exec: vi.fn(),
          attach: vi.fn(),
          sync: vi.fn(),
          ensureTunnel: vi.fn(),
          getConnectionHandle: vi.fn().mockReturnValue('local'),
          setOverrideHost: vi.fn(),
          getMagicRemote: vi.fn().mockReturnValue('local'),
        } as any,
        processManager,
        ProviderFactory.getExecutors(processManager),
        {
          repoRoot,
          repoName: 'test-repo',
        },
        {
          providerType: 'local-docker',
          instanceName: 'station-test-repo',
        },
        {
          projectId: 'local',
          zone: 'localhost',
          stationName: 'station-test-repo',
        },
      );

      const ok = await provider.verifyIgnition({
        onLog: vi.fn(),
      } as any);

      const normalizedHistory = harness
        .getHistory()
        .map((line) =>
          line
            .replaceAll('\\', '/')
            .replaceAll(process.cwd().replaceAll('\\', '/'), '<cwd>')
            .replaceAll(repoRoot.replaceAll('\\', '/'), '<tmp>/repo'),
        );

      expect({
        ok,
        history: normalizedHistory,
      }).toMatchSnapshot();
    },
  );
});

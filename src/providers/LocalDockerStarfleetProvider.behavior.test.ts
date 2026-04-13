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
import { normalizeBehaviorHistory } from '../test/BehaviorSnapshot.js';
import { LogLevel } from '../core/Logger.js';

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

if (joined === 'build -t orbit-worker:local -f docker/orbit-worker.Dockerfile .') {
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

      const normalizedHistory = normalizeBehaviorHistory(harness.getHistory(), {
        placeholders: {
          [process.cwd()]: '<cwd>',
          [repoRoot]: '<tmp>/repo',
        },
      });

      expect({
        ok,
        history: normalizedHistory,
      }).toMatchSnapshot();
    },
  );

  it('bridges to an existing host-mode supervisor without starting a supervisor container', async () => {
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
const joined = args.join(' ');

if (joined === 'image inspect orbit-worker:local') {
  process.stdout.write('[]\\n');
  process.exit(0);
}

if (joined === 'run --rm --entrypoint /usr/local/share/npm-global/bin/gemini orbit-worker:local --version') {
  process.stdout.write('gemini 0.0.0-test\\n');
  process.exit(0);
}

if (joined.includes('--name station-supervisor-local')) {
  process.stderr.write('should not start local supervisor container when host-mode is healthy\\n');
  process.exit(99);
}

process.exit(0);
`,
    );

    const processManager = harness.createProcessManager();
    const observer = {
      onLog: vi.fn(),
    } as any;
    const client = {
      ping: vi.fn().mockResolvedValue(true),
      setBaseUrl: vi.fn(),
    } as any;

    const provider = new LocalDockerStarfleetProvider(
      client,
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
        instanceName: 'local-docker',
      },
      {
        projectId: 'local',
        zone: 'localhost',
        stationName: 'local-docker',
      },
    );

    const ok = await provider.verifyIgnition(observer);

    const normalizedHistory = normalizeBehaviorHistory(harness.getHistory(), {
      placeholders: {
        [process.cwd()]: '<cwd>',
        [repoRoot]: '<tmp>/repo',
      },
    });

    expect(ok).toBe(true);
    expect(client.ping).toHaveBeenCalled();
    expect(normalizedHistory).toEqual([
      '[<cwd>] docker image inspect orbit-worker:local',
      '[<cwd>] docker run --rm --entrypoint /usr/local/share/npm-global/bin/gemini orbit-worker:local --version',
    ]);
    expect(observer.onLog).toHaveBeenCalledWith(
      LogLevel.INFO,
      'SETUP',
      '🔗 Bridging to existing host-mode Starfleet Supervisor.',
    );
  });
});

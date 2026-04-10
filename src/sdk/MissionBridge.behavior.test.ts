/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MissionManager } from './MissionManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { StationRegistry } from './StationRegistry.js';
import { StarfleetClient } from './StarfleetClient.js';
import {
  RecordingProcessManager,
  formatRecordedCommands,
} from '../test/RecordingProcessManager.js';

describe('Mission Bridge Behavior', () => {
  let tempDir: string;
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
  );

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-behavior-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it(
    'records the known-good GCE launch command stream',
    { timeout: 5000 },
    async () => {
      const expectedHostname =
        'nic0.corp-remote-v1.us-west1-a.c.corp-project-99.internal.gcpnode.com';

      let missionContainerExists = false;

      const pm = new RecordingProcessManager(({ bin, args }) => {
        const joinedArgs = args.join(' ');

        if (bin === 'gcloud' && joinedArgs.includes('instances list')) {
          return {
            status: 0,
            stdout: JSON.stringify([{ name: 'corp-remote-v1' }]),
            stderr: '',
          };
        }

        if (bin === 'ssh' && joinedArgs.includes('docker inspect')) {
          if (joinedArgs.includes('corp-remote-v1')) {
            return { status: 0, stdout: 'true', stderr: '' };
          }

          if (joinedArgs.includes('real-repo-bridge-test-1-review')) {
            return missionContainerExists
              ? { status: 0, stdout: 'true', stderr: '' }
              : { status: 1, stdout: 'false', stderr: 'Error: No such object' };
          }
        }

        if (
          bin === 'ssh' &&
          joinedArgs.includes('docker run') &&
          joinedArgs.includes('real-repo-bridge-test-1-review')
        ) {
          missionContainerExists = true;
          return { status: 0, stdout: 'started', stderr: '' };
        }

        return { status: 0, stdout: '', stderr: '' };
      });

      const baseExecutors = ProviderFactory.getExecutors(pm);
      const executors: any = {
        ...baseExecutors,
        ssh: {
          runHostCommand: vi.fn().mockImplementation(async (cmd, options) => {
            return executors.ssh.execAsync(
              expectedHostname,
              `${cmd.bin} ${cmd.args.join(' ')}`,
              options,
            );
          }),
          exec: vi.fn().mockImplementation((target, cmd, options) => {
            return pm.runSync('ssh', [target, cmd], options);
          }),
          execAsync: vi
            .fn()
            .mockImplementation(async (target, cmd, options) => {
              return pm.run('ssh', [target, cmd], options);
            }),
          rsync: vi.fn().mockImplementation((local, remote, options) => {
            return pm.runSync('rsync', [local, remote], options);
          }),
          withConnectivityRetry: vi.fn().mockImplementation((op) => op()),
          getMagicRemote: vi.fn().mockReturnValue(`bob@${expectedHostname}`),
          setOverrideHost: vi.fn(),
        },
      };

      const factory = new ProviderFactory(pm, executors);
      const configManager: any = {
        loadProjectConfig: vi.fn().mockReturnValue({}),
        loadSettings: vi.fn().mockReturnValue({}),
        loadSchematic: vi.fn(),
        detectRemoteUrl: vi.fn().mockReturnValue('http://git.real'),
      };
      const registry = new StationRegistry(factory, configManager);

      const manager = new MissionManager(
        { repoRoot: tempDir, repoName: 'real-repo' },
        {
          projectId: 'corp-project-99',
          zone: 'us-west1-a',
          instanceName: 'corp-remote-v1',
          providerType: 'gce',
          workspacesDir: '/mnt/disks/data/workspaces',
          remoteWorkDir: '/mnt/disks/data',
          starfleet: false,
        } as any,
        { onLog: vi.fn(), onProgress: vi.fn() } as any,
        factory,
        configManager,
        pm,
        executors,
        registry,
        new StarfleetClient(),
      );

      const manifest = await manager.resolve({
        identifier: 'BRIDGE-TEST-1',
        action: 'review',
      });
      const result = await manager.start(manifest);

      expect(result.exitCode).toBe(0);
      expect(
        formatRecordedCommands(pm.history, {
          [repoRoot]: '<repo>',
          [os.homedir()]: '<home>',
          [os.tmpdir()]: '<os-tmp>',
          [tempDir]: '<tmp>',
        }),
      ).toMatchSnapshot();
    },
  );
});

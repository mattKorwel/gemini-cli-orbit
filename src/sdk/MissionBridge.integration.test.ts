/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MissionManager } from './MissionManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { StationRegistry } from './StationRegistry.js';
import { main as stationMain } from '../station/station.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CAPSULE_MANIFEST_PATH,
  LOCAL_MANIFEST_NAME,
} from '../core/Constants.js';

describe('Mission Bridge Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should fail if the station is started without a manifest', async () => {
    const mockPm: any = {
      runSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
    };
    const originalExists = fs.existsSync;
    (fs as any).existsSync = vi.fn().mockReturnValue(false);
    try {
      const code = await stationMain(['start'], mockPm);
      expect(code).toBe(1);
    } finally {
      (fs as any).existsSync = originalExists;
    }
  });

  it(
    'should execute end-to-end GCE mission via Triple-Bridge (SDK -> SSH -> Station -> Docker -> Mission)',
    { timeout: 5000 },
    async () => {
      const recordedCommands: {
        bin: string;
        args: string[];
        env: any;
        host: string;
      }[] = [];
      const expectedHostname =
        'nic0.corp-remote-v1.us-west1-a.c.corp-project-99.internal.gcpnode.com';

      let missionContainerExists = false;

      const systemPm: any = {
        runSync: vi.fn().mockImplementation((bin, args, options) => {
          recordedCommands.push({
            bin,
            args: args || [],
            env: options?.env || {},
            host: 'local',
          });

          const res = { status: 0, stdout: '', stderr: '' };

          if (
            args?.some(
              (a: string) => typeof a === 'string' && a.includes('inspect'),
            )
          ) {
            if (args.some((a: string) => a.includes('corp-remote-v1'))) {
              res.stdout = 'true';
            } else if (
              args.some((a: string) => a.includes('real-repo-bridge-test-1'))
            ) {
              if (!missionContainerExists) {
                res.status = 1;
              } else {
                res.stdout = 'true';
              }
            }
          }

          if (
            args?.some(
              (a: string) =>
                typeof a === 'string' &&
                a.includes('instances') &&
                a.includes('list'),
            )
          ) {
            res.stdout = JSON.stringify([{ name: 'corp-remote-v1' }]);
          }
          return res;
        }),
      };

      const mockExecutors: any = {
        git: ProviderFactory.getExecutors(systemPm).git,
        docker: ProviderFactory.getExecutors(systemPm).docker,
        tmux: ProviderFactory.getExecutors(systemPm).tmux,
        node: ProviderFactory.getExecutors(systemPm).node,
        gemini: ProviderFactory.getExecutors(systemPm).gemini,
        ssh: {
          exec: vi.fn().mockImplementation((target, cmd) => {
            recordedCommands.push({
              bin: 'ssh',
              args: [target, cmd],
              env: {},
              host: 'local',
            });

            if (cmd.includes('docker inspect')) {
              if (cmd.includes('corp-remote-v1')) {
                return { status: 0, stdout: 'true', stderr: '' };
              }
              if (cmd.includes('real-repo-bridge-test-1')) {
                if (!missionContainerExists) {
                  return {
                    status: 1,
                    stdout: 'false',
                    stderr: 'Error: No such object',
                  };
                }
                return { status: 0, stdout: 'true', stderr: '' };
              }
            }

            if (
              cmd.includes('docker run') &&
              cmd.includes('real-repo-bridge-test-1')
            ) {
              missionContainerExists = true;
            }
            return { status: 0, stdout: 'true', stderr: '' };
          }),
          rsync: vi.fn().mockImplementation((local, remote) => {
            recordedCommands.push({
              bin: 'rsync',
              args: [local, remote],
              env: {},
              host: 'local',
            });
            return { status: 0, stdout: '', stderr: '' };
          }),
          withConnectivityRetry: vi.fn().mockImplementation((op) => op()),
          getMagicRemote: vi.fn().mockReturnValue('bob@' + expectedHostname),
          setOverrideHost: vi.fn(),
        },
      };

      const factory = new ProviderFactory(systemPm, mockExecutors);
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
        } as any,
        { onLog: vi.fn(), onProgress: vi.fn() } as any,
        factory,
        configManager,
        systemPm,
        mockExecutors,
        registry,
      );

      const manifest = await manager.resolve({
        identifier: 'BRIDGE-TEST-1',
        action: 'chat',
      });
      await manager.start(manifest);

      expect(
        recordedCommands.some(
          (c) =>
            c.bin === 'rsync' &&
            c.args.some(
              (a) => typeof a === 'string' && a.includes('.orbit-manifest'),
            ),
        ),
      ).toBe(true);

      const dockerRunSsh = recordedCommands.find(
        (c) =>
          (c.bin === 'ssh' || c.bin === 'local') &&
          c.args.some((a) => typeof a === 'string' && a.includes('docker run')),
      );
      expect(dockerRunSsh).toBeDefined();
      expect(dockerRunSsh?.args.join(' ')).toContain(
        `${CAPSULE_MANIFEST_PATH}`,
      );

      const dockerExecSsh = recordedCommands.find(
        (c) =>
          (c.bin === 'ssh' || c.bin === 'local') &&
          c.args.some(
            (a) => typeof a === 'string' && a.includes('docker exec'),
          ),
      );
      expect(dockerExecSsh).toBeDefined();
      expect(dockerExecSsh?.args.join(' ')).not.toContain(
        'GCLI_ORBIT_MANIFEST',
      );
    },
  );
});

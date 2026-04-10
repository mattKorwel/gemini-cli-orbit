/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { StarfleetProvider } from './StarfleetProvider.js';
import { LogLevel } from '../core/Logger.js';
import { type OrbitObserver } from '../core/types.js';
import { findDockerSocket, findAvailablePort } from '../utils/DockerUtils.js';
import {
  CAPSULE_ROOT,
  CAPSULE_BUNDLE_PATH,
  SUPERVISOR_ENTRYPOINT_SOURCE_PATH,
  GLOBAL_GH_CONFIG_DIR,
} from '../core/Constants.js';
import path from 'node:path';
import os from 'node:os';

/**
 * LocalDockerStarfleetProvider: Specialized provider for local Starfleet.
 * Ensures the Station Supervisor is running in a local Docker container.
 */
export class LocalDockerStarfleetProvider extends StarfleetProvider {
  public readonly type = 'local-docker';
  private selectedPort: number = 8080;
  private static readonly localWorkerDockerfile = 'orbit-worker.Dockerfile';
  private static readonly localWorkerImage = 'orbit-worker:local';
  private static readonly localWorkerGeminiBin =
    '/usr/local/share/npm-global/bin/gemini';
  private static readonly localDockerHome = path.posix.join(
    CAPSULE_ROOT,
    'home',
  );
  private static readonly localDockerGeminiDir = path.posix.join(
    LocalDockerStarfleetProvider.localDockerHome,
    '.gemini',
  );
  private static readonly localDockerGhConfigDir = path.posix.join(
    LocalDockerStarfleetProvider.localDockerHome,
    '.config',
    'gh',
  );

  private getHostOrbitRoot(): string {
    return path.join(this.projectCtx.repoRoot, 'orbit-test-run');
  }

  private resolveLocalWorkerImage(): string {
    const configPath = path.join(
      this.projectCtx.repoRoot,
      'configs',
      'station.local.json',
    );

    if (!fs.existsSync(configPath)) {
      return LocalDockerStarfleetProvider.localWorkerImage;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
        workerImage?: string;
      };
      return (
        parsed.workerImage || LocalDockerStarfleetProvider.localWorkerImage
      );
    } catch {
      return LocalDockerStarfleetProvider.localWorkerImage;
    }
  }

  private ensureLocalWorkerImage(observer: OrbitObserver): string {
    const image = this.resolveLocalWorkerImage();
    const validateGemini = () =>
      this.pm.runSync(
        'docker',
        [
          'run',
          '--rm',
          '--entrypoint',
          LocalDockerStarfleetProvider.localWorkerGeminiBin,
          image,
          '--version',
        ],
        { quiet: true },
      );

    const inspect = this.pm.runSync('docker', ['image', 'inspect', image], {
      quiet: true,
    });
    if (inspect.status === 0 && validateGemini().status === 0) {
      observer.onLog?.(LogLevel.DEBUG, 'SETUP', `Worker image ready: ${image}`);
      return image;
    }

    observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      `🏗️ Building local worker image (${image}) from ${LocalDockerStarfleetProvider.localWorkerDockerfile}...`,
    );

    const build = this.pm.runSync(
      'docker',
      [
        'build',
        '-t',
        image,
        '-f',
        LocalDockerStarfleetProvider.localWorkerDockerfile,
        '.',
      ],
      {
        cwd: this.projectCtx.repoRoot,
        interactive: true,
      },
    );

    if (build.status !== 0) {
      throw new Error(
        `Failed to build local worker image ${image}: ${build.stderr || build.stdout}`.trim(),
      );
    }

    const postBuildCheck = validateGemini();
    if (postBuildCheck.status !== 0) {
      throw new Error(
        `Local worker image ${image} does not provide the gemini binary after build.`,
      );
    }

    observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      `✅ Local worker image ready: ${image}`,
    );
    return image;
  }

  override resolveWorkspacesRoot(): string {
    return path.join(this.getHostOrbitRoot(), 'workspaces');
  }

  override resolveWorkDir(workspaceName: string): string {
    return path.join(this.resolveWorkspacesRoot(), workspaceName);
  }

  override resolveOrbitRoot(): string {
    return CAPSULE_ROOT;
  }

  override resolveWorkerPath(): string {
    return path.posix.join(CAPSULE_BUNDLE_PATH, 'station.js');
  }

  override resolvePolicyPath(): string {
    return path.posix.join(
      CAPSULE_ROOT,
      '.gemini/policies/workspace-policy.toml',
    );
  }

  override resolveGlobalConfigDir(): string {
    return LocalDockerStarfleetProvider.localDockerGeminiDir;
  }

  /**
   * Helper to find the GID of the Docker socket inside the Linux VM.
   * On Docker Desktop (Mac/Win) this is usually 0. On GCE COS it's 999 or 412.
   */
  private getDockerSocketGid(): string {
    const res = this.pm.runSync('docker', [
      'run',
      '--rm',
      '-v',
      '/var/run/docker.sock:/var/run/docker.sock',
      'alpine',
      'stat',
      '-c',
      '%g',
      '/var/run/docker.sock',
    ]);
    return res.stdout.trim() || '0';
  }

  /**
   * Deep verification for local Starfleet: Ensures the Supervisor container is running.
   */
  override async verifyIgnition(observer: OrbitObserver): Promise<boolean> {
    const startTime = Date.now();
    const timeout = 60 * 1000;
    const containerName = 'station-supervisor-local';
    const image = 'ghcr.io/mattkorwel/gemini-cli-orbit:latest';
    this.ensureLocalWorkerImage(observer);

    observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      `🛸 Igniting local Starfleet Supervisor container (${containerName})...`,
    );

    const updateUI = (message: string, isComplete = false, isError = false) => {
      const icon = isError ? '❌' : isComplete ? '✅' : '⏳';
      const dots = '.'.repeat(Math.max(1, 35 - message.length));
      const line = `   ${icon} ${message} ${dots} ${isComplete ? 'Success' : isError ? 'Failed' : 'Pending'}`;

      if (process.stdout.isTTY) {
        process.stdout.write(`\r\x1b[K${line}`);
        if (isComplete || isError) process.stdout.write('\n');
      } else {
        observer.onLog?.(LogLevel.INFO, 'SETUP', line);
      }
    };

    // 1. Resolve Environment (Socket and Port)
    const dockerSocket = findDockerSocket();

    // Check if a supervisor is ALREADY running on the host (Host-Bridge Mode)
    // This is the most reliable path on Windows/Mac dev environments
    updateUI('Checking for host-mode supervisor');
    const hostAlive = await this.client.ping();
    if (hostAlive) {
      updateUI('Checking for host-mode supervisor', true);
      observer.onLog?.(
        LogLevel.INFO,
        'SETUP',
        '🔗 Bridging to existing host-mode Starfleet Supervisor.',
      );
      return true;
    }

    this.selectedPort = await findAvailablePort(8080);
    this.client.setBaseUrl(`http://localhost:${this.selectedPort}`);

    while (Date.now() - startTime < timeout) {
      try {
        updateUI('Checking supervisor container');
        const check = this.pm.runSync('docker', [
          'ps',
          '-a',
          '--filter',
          `name=^${containerName}$`,
          '--format',
          '{{.Status}}',
        ]);

        const status = check.stdout.trim();
        const isUp = /\bUp\b/.test(status);

        if (!isUp) {
          updateUI('Starting supervisor container');

          // Force cleanup of stale container
          this.pm.runSync('docker', ['rm', '-f', containerName], {
            quiet: true,
          });

          const home = os.homedir();
          const root = this.projectCtx.repoRoot;
          const orbitRoot = this.getHostOrbitRoot();
          const gid = this.getDockerSocketGid();
          const hostGhConfigDir = GLOBAL_GH_CONFIG_DIR;
          const configsCapsulePath = path.posix.join(CAPSULE_ROOT, 'configs');
          const entrypointCapsulePath = SUPERVISOR_ENTRYPOINT_SOURCE_PATH;
          const supervisorCmd = `node ${CAPSULE_BUNDLE_PATH}/orbit-server.js --config=${CAPSULE_ROOT}/configs/station.local.json`;
          const mounts: {
            host: string;
            capsule: string;
            readonly?: boolean;
          }[] = [
            {
              host: dockerSocket,
              capsule: '/var/run/docker.sock',
            },
            {
              host: '/dev/shm',
              capsule: '/dev/shm',
            },
            {
              host: orbitRoot,
              capsule: CAPSULE_ROOT,
            },
            {
              host: path.join(home, '.gemini'),
              capsule: LocalDockerStarfleetProvider.localDockerGeminiDir,
              readonly: true,
            },
            {
              host: path.join(root, 'bundle'),
              capsule: CAPSULE_BUNDLE_PATH,
              readonly: true,
            },
            {
              host: path.join(root, 'configs'),
              capsule: configsCapsulePath,
              readonly: true,
            },
            {
              host: path.join(root, 'starfleet-entrypoint.sh'),
              capsule: entrypointCapsulePath,
              readonly: true,
            },
          ];

          if (fs.existsSync(hostGhConfigDir)) {
            mounts.push({
              host: hostGhConfigDir,
              capsule: LocalDockerStarfleetProvider.localDockerGhConfigDir,
              readonly: true,
            });
          }

          // ADR 0022: Local Docker provisioning
          const runCmd = this.executors.docker.run(image, supervisorCmd, {
            name: containerName,
            user: 'root',
            groupAdd: gid,
            ports: [
              {
                host: this.selectedPort,
                container: 8080,
              },
            ],
            mounts,
            env: {
              GCLI_ORBIT_DEV: '1',
              HOME: LocalDockerStarfleetProvider.localDockerHome,
              DOCKER_HOST: 'unix:///var/run/docker.sock',
              ORBIT_SERVER_PORT: '8080',
              ORBIT_HOST_ROOT: orbitRoot,
              GCLI_ORBIT_BUNDLE_PATH: path.join(root, 'bundle'),
              GCLI_ORBIT_CONFIGS_HOST: path.join(root, 'configs'),
              GCLI_ORBIT_GEMINI_DIR_HOST: path.join(home, '.gemini'),
              GCLI_ORBIT_POLICIES_HOST: path.join(root, '.gemini', 'policies'),
              GCLI_ORBIT_ENTRYPOINT_HOST: path.join(
                root,
                'starfleet-entrypoint.sh',
              ),
              ...(fs.existsSync(hostGhConfigDir)
                ? { GCLI_ORBIT_GH_CONFIG_HOST: hostGhConfigDir }
                : {}),
            },
          } as any);

          console.info(
            `[SETUP] 🏃 Running Supervisor Command: ${runCmd.bin} ${runCmd.args.join(' ')}`,
          );
          console.info(
            `[SETUP]    - Options: ${JSON.stringify(runCmd.options)}`,
          );

          const startRes = await this.pm.run(
            runCmd.bin,
            runCmd.args,
            runCmd.options,
          );
          if (startRes.status !== 0) {
            throw new Error(`Failed to start supervisor: ${startRes.stderr}`);
          }

          // Grace period for API to bind
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        updateUI(`Connecting to Starfleet API (port ${this.selectedPort})`);
        const alive = await this.client.ping();
        if (alive) {
          updateUI(
            `Connecting to Starfleet API (port ${this.selectedPort})`,
            true,
          );
          return true;
        }
      } catch (_e: any) {
        // Silent retry
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    updateUI('Connecting to Starfleet API', false, true);
    return false;
  }
}

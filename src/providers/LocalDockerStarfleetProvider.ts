/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StarfleetProvider } from './StarfleetProvider.js';
import { LogLevel } from '../core/Logger.js';
import { type OrbitObserver } from '../core/types.js';
import path from 'node:path';
import os from 'node:os';

/**
 * LocalDockerStarfleetProvider: Specialized provider for local Starfleet.
 * Ensures the Station Supervisor is running in a local Docker container.
 */
export class LocalDockerStarfleetProvider extends StarfleetProvider {
  public readonly type = 'local-docker';

  override resolveOrbitRoot(): string {
    // Inside the supervisor container, this is the standard path
    return '/mnt/disks/data';
  }

  override resolveWorkerPath(): string {
    return '/usr/local/lib/orbit/bundle/station.js';
  }

  override resolvePolicyPath(): string {
    return '/mnt/disks/data/.gemini/policies/workspace-policy.toml';
  }

  /**
   * Deep verification for local Starfleet: Ensures the Supervisor container is running.
   */
  override async verifyIgnition(observer: OrbitObserver): Promise<boolean> {
    const startTime = Date.now();
    const timeout = 60 * 1000;
    const containerName = 'station-supervisor-local';
    const image = 'ghcr.io/mattkorwel/gemini-cli-orbit:latest';

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

    while (Date.now() - startTime < timeout) {
      try {
        updateUI('Checking supervisor container');
        const check = this.pm.runSync('docker', [
          'ps',
          '--filter',
          `name=${containerName}`,
          '--format',
          '{{.Status}}',
        ]);

        if (!check.stdout.includes('Up')) {
          updateUI('Starting supervisor container');

          // Force cleanup of stale container
          this.pm.runSync('docker', ['rm', '-f', containerName], {
            quiet: true,
          });

          const home = os.homedir();
          const root = this.projectCtx.repoRoot;
          const dockerSocket = path.join(home, '.docker/run/docker.sock');

          // ADR 0022: Local Docker provisioning
          const runArgs = [
            'run',
            '-d',
            '--name',
            containerName,
            '--restart',
            'always',
            '-p',
            '8080:8080',
            '-v',
            `${dockerSocket}:/var/run/docker.sock`,
            '-v',
            `${path.join(root, 'orbit-test-run')}:/mnt/disks/data`,
            '-v',
            `${path.join(home, '.gemini')}:/home/node/.gemini`,
            '-v',
            `${path.join(root, 'bundle')}:/usr/local/lib/orbit/bundle:ro`,
            '-e',
            'GCLI_ORBIT_DEV=1',
            image,
          ];

          const startRes = this.pm.runSync('docker', runArgs);
          if (startRes.status !== 0) {
            throw new Error(`Failed to start supervisor: ${startRes.stderr}`);
          }
        }

        updateUI('Connecting to Starfleet API');
        const alive = await this.client.ping();
        if (alive) {
          updateUI('Connecting to Starfleet API', true);
          return true;
        }
      } catch (_e: any) {
        // Silent retry
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    updateUI('Connecting to Starfleet API', false, true);
    return false;
  }
}

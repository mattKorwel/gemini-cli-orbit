/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StarfleetProvider } from './StarfleetProvider.js';
import { LogLevel } from '../core/Logger.js';
import { type OrbitObserver } from '../core/types.js';
import path from 'node:path';

/**
 * GceStarfleetProvider: Specialized provider for GCP Container-Optimized OS.
 * Performs a full hardware handshake before verifying the API.
 */
export class GceStarfleetProvider extends StarfleetProvider {
  public readonly type = 'gce';

  /**
   * Syncs the local ~/.gemini config to the remote host so containers
   * can inherit trust and settings.
   */
  override async syncGlobalConfig(): Promise<number> {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const localConfig = path.join(home, '.gemini');
    const remoteConfig = this.resolveGlobalConfigDir();

    // Use transport to sync files
    return this.transport.sync(`${localConfig}/`, remoteConfig, {
      delete: true,
      sudo: true,
      quiet: true,
    });
  }

  /**
   * Performs deep verification of GCE hardware (SSH, Disk, Docker) before API check.
   */
  override async verifyIgnition(observer: OrbitObserver): Promise<boolean> {
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000;
    let step = 0;

    const steps = [
      'Establishing connection (SSH)',
      'Checking data disk mount',
      'Verifying filesystem paths',
      'Checking Docker daemon',
      'Starting Station Supervisor container',
      'Connecting to Starfleet API',
    ];

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

    observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      '🛸 Starfleet GCE Ignition sequence started...',
    );

    while (Date.now() - startTime < timeout) {
      try {
        const currentStep = steps[step];
        if (!currentStep) break;

        updateUI(currentStep);

        // Step 1: SSH Connectivity
        if (step === 0) {
          const res = await this.transport.exec(
            { bin: 'echo', args: ['pong'] },
            { quiet: true },
          );
          if (res.status === 0) {
            updateUI(steps[0]!, true);
            step = 1;
            continue;
          }
        }

        // Step 2: Disk Mount
        if (step === 1) {
          const res = await this.transport.exec(
            { bin: 'df', args: ['-h', '/mnt/disks/data'] },
            { quiet: true },
          );
          if (res.status === 0) {
            updateUI(steps[1]!, true);
            step = 2;
            continue;
          }
        }

        // Step 3: Filesystem Paths
        if (step === 2) {
          const res = await this.transport.exec(
            { bin: 'ls', args: ['-d', '/mnt/disks/data/workspaces'] },
            { quiet: true },
          );
          if (res.status === 0) {
            updateUI(steps[2]!, true);
            step = 3;
            continue;
          }
        }

        // Step 4: Docker Daemon
        if (step === 3) {
          const res = await this.transport.exec(
            { bin: 'sudo', args: ['docker', 'version'] },
            { quiet: true },
          );
          if (res.status === 0) {
            updateUI(steps[3]!, true);
            step = 4;
            continue;
          }
        }

        // Step 5: Supervisor Container
        if (step === 4) {
          const res = await this.transport.exec(
            {
              bin: 'sudo',
              args: [
                'docker',
                'ps',
                '--filter',
                'name=station-supervisor',
                '--format',
                '{{.Status}}',
              ],
            },
            { quiet: true },
          );
          if (res.stdout.includes('Up')) {
            updateUI(steps[4]!, true);
            step = 5;
            continue;
          }
        }

        // Step 6: API Connectivity
        if (step === 5) {
          const alive = await this.client.ping();
          if (alive) {
            updateUI(steps[5]!, true);
            return true;
          } else {
            // Ensure tunnel is open for remote API
            await this.transport.ensureTunnel(8080, 8080);
          }
        }
      } catch (_e: any) {
        // Silent retry
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    const finalStep = steps[step];
    if (finalStep) updateUI(finalStep, false, true);
    return false;
  }
}

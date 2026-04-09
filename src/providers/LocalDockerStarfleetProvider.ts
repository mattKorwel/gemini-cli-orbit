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
 * LocalDockerStarfleetProvider: Specialized provider for local Starfleet (Docker on Mac).
 * Verification is lightweight as the host is the local machine.
 */
export class LocalDockerStarfleetProvider extends StarfleetProvider {
  public readonly type = 'local-docker';

  override resolveOrbitRoot(): string {
    // On local Mac, we use the project-relative orbit-test-run folder
    return path.resolve(this.projectCtx.repoRoot, 'orbit-test-run');
  }

  override resolveWorkerPath(): string {
    return path.join(this.projectCtx.repoRoot, 'bundle/station.js');
  }

  /**
   * Simple verification for local Starfleet.
   */
  override async verifyIgnition(observer: OrbitObserver): Promise<boolean> {
    const startTime = Date.now();
    const timeout = 30 * 1000; // Shorter timeout for local

    observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      '🛸 Local Starfleet Ignition sequence started...',
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
        updateUI('Connecting to local Starfleet API');
        const alive = await this.client.ping();
        if (alive) {
          updateUI('Connecting to local Starfleet API', true);
          return true;
        }
      } catch (_e: any) {
        // Silent retry
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    updateUI('Connecting to local Starfleet API', false, true);
    return false;
  }
}

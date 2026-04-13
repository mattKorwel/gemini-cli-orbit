/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StarfleetProvider } from './StarfleetProvider.js';
import { LogLevel } from '../core/Logger.js';
import { type OrbitObserver } from '../core/types.js';

/**
 * GceStarfleetProvider: Specialized provider for GCP Container-Optimized OS.
 * Performs a full hardware handshake before verifying the API.
 */
export class GceStarfleetProvider extends StarfleetProvider {
  public readonly type = 'gce';

  override resolveCapsuleOrbitRoot(): string {
    return '/orbit/data';
  }

  private truncate(text: string | undefined, max = 220): string {
    if (!text) return '';
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 3)}...`;
  }

  private describeExecResult(res: {
    status: number;
    stdout?: string;
    stderr?: string;
  }): string {
    const parts = [`status=${res.status}`];
    const stderr = this.truncate(res.stderr);
    const stdout = this.truncate(res.stdout);
    if (stderr) parts.push(`stderr=${JSON.stringify(stderr)}`);
    if (stdout) parts.push(`stdout=${JSON.stringify(stdout)}`);
    return parts.join(' ');
  }

  /**
   * Performs deep verification of GCE hardware (SSH, Disk, Docker) before API check.
   */
  override async verifyIgnition(observer: OrbitObserver): Promise<boolean> {
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000;
    let step = 0;
    let attempt = 0;

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
    observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      `   - Ignition target: ${this.transport.getConnectionHandle()}`,
    );
    observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      `   - API endpoint: http://127.0.0.1:${await this.ensureApiEndpoint()} (via SSH tunnel)`,
    );

    while (Date.now() - startTime < timeout) {
      attempt += 1;
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
          observer.onLog?.(
            LogLevel.WARN,
            'SETUP',
            `   - SSH probe failed on attempt ${attempt}: ${this.describeExecResult(res)}`,
          );
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
          observer.onLog?.(
            LogLevel.WARN,
            'SETUP',
            `   - Disk mount check failed on attempt ${attempt}: ${this.describeExecResult(res)}`,
          );
        }

        // Step 3: Filesystem Paths
        if (step === 2) {
          const res = await this.transport.exec(
            { bin: 'ls', args: ['-d', '/mnt/disks/data'] },
            { quiet: true },
          );
          if (res.status === 0) {
            updateUI(steps[2]!, true);
            step = 3;
            continue;
          }
          observer.onLog?.(
            LogLevel.WARN,
            'SETUP',
            `   - Workspace path check failed on attempt ${attempt}: ${this.describeExecResult(res)}`,
          );
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
          observer.onLog?.(
            LogLevel.WARN,
            'SETUP',
            `   - Docker daemon check failed on attempt ${attempt}: ${this.describeExecResult(res)}`,
          );
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
          observer.onLog?.(
            LogLevel.WARN,
            'SETUP',
            `   - Supervisor container not ready on attempt ${attempt}: ${this.describeExecResult(res)}`,
          );
        }

        // Step 6: API Connectivity
        if (step === 5) {
          const alive = await this.client.ping();
          if (alive) {
            updateUI(steps[5]!, true);
            return true;
          } else {
            observer.onLog?.(
              LogLevel.WARN,
              'SETUP',
              `   - API ping failed on attempt ${attempt}; ensuring local tunnel ${this.getSelectedApiPort()}->8080.`,
            );
            // Ensure tunnel is open for remote API
            await this.transport.ensureTunnel(this.getSelectedApiPort(), 8080);
          }
        }
      } catch (e: any) {
        observer.onLog?.(
          LogLevel.WARN,
          'SETUP',
          `   - ${steps[step] || 'Ignition'} threw on attempt ${attempt}: ${this.truncate(e?.message || String(e))}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    const finalStep = steps[step];
    if (finalStep) updateUI(finalStep, false, true);
    observer.onLog?.(
      LogLevel.ERROR,
      'SETUP',
      `   - Ignition timed out on step ${step + 1}/${steps.length}: ${finalStep || 'unknown step'}`,
    );
    return false;
  }
}

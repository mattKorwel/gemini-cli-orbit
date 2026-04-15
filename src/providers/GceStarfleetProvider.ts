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
  private readonly supervisorContainerName = 'station-supervisor';
  private readonly supervisorImage =
    'ghcr.io/mattkorwel/gemini-cli-orbit:latest';
  private readonly workerImage = 'ghcr.io/mattkorwel/orbit-worker:latest';

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

  private async inspectSupervisorContainer(): Promise<{
    exists: boolean;
    status: string;
    observedStatus: string;
    restarting: boolean;
    restartCount: number;
  }> {
    const ps = await this.transport.exec(
      {
        bin: 'sudo',
        args: [
          'docker',
          'ps',
          '-a',
          '--filter',
          `name=^/${this.supervisorContainerName}$`,
          '--format',
          '{{.Status}}',
        ],
      },
      { quiet: true },
    );
    const psStatus = (ps.stdout || '').trim();
    const existsInPs = ps.status === 0 && psStatus.length > 0;

    const res = await this.transport.exec(
      {
        bin: 'sudo',
        args: [
          'docker',
          'inspect',
          '--format',
          '{{.State.Status}}|{{.State.Restarting}}|{{.RestartCount}}',
          this.supervisorContainerName,
        ],
      },
      { quiet: true },
    );

    if (res.status !== 0) {
      const loweredPsStatus = psStatus.toLowerCase();
      let normalizedStatus = 'missing';
      if (existsInPs) {
        if (loweredPsStatus.startsWith('up')) {
          normalizedStatus = 'running';
        } else if (loweredPsStatus.includes('restarting')) {
          normalizedStatus = 'restarting';
        } else if (loweredPsStatus.includes('exited')) {
          normalizedStatus = 'exited';
        } else if (loweredPsStatus.includes('dead')) {
          normalizedStatus = 'dead';
        } else {
          normalizedStatus = 'unknown-existing';
        }
      }
      return {
        exists: existsInPs,
        status: normalizedStatus,
        observedStatus: existsInPs ? psStatus || 'unknown-existing' : 'missing',
        restarting: loweredPsStatus.includes('restarting'),
        restartCount: 0,
      };
    }

    const [status = 'unknown', restarting = 'false', restartCount = '0'] = (
      res.stdout || ''
    )
      .trim()
      .split('|');

    return {
      exists: true,
      status,
      observedStatus: status,
      restarting: restarting === 'true',
      restartCount: Number.parseInt(restartCount, 10) || 0,
    };
  }

  private async refreshSupervisorRuntime(): Promise<{
    status: number;
    stderr?: string;
    stdout?: string;
  }> {
    return this.transport.exec(
      {
        bin: 'sh',
        args: [
          '-lc',
          [
            'set -eu',
            'sudo chmod 666 /var/run/docker.sock',
            `sudo docker pull ${this.supervisorImage}`,
            `sudo docker pull ${this.workerImage}`,
            `sudo docker rm -f ${this.supervisorContainerName} >/dev/null 2>&1 || true`,
            [
              'sudo docker run -d',
              `--name ${this.supervisorContainerName}`,
              '--restart always',
              '-p 8080:8080',
              '-v /var/run/docker.sock:/var/run/docker.sock',
              '-v /mnt/disks/data:/mnt/disks/data',
              '-v /dev/shm:/dev/shm',
              '-e ORBIT_SERVER_PORT=8080',
              `-e GCLI_ORBIT_WORKER_IMAGE=${this.workerImage}`,
              this.supervisorImage,
            ].join(' '),
          ].join(' && '),
        ],
      },
      { quiet: true },
    );
  }

  private async getSupervisorLogs(): Promise<string> {
    const res = await this.transport.exec(
      {
        bin: 'sudo',
        args: ['docker', 'logs', '--tail', '80', this.supervisorContainerName],
      },
      { quiet: true },
    );

    return this.truncate(res.stderr || res.stdout, 1200);
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
      'Refreshing Station Supervisor container',
      'Connecting to Starfleet API',
    ];
    let supervisorRefreshComplete = false;

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
          if (!supervisorRefreshComplete) {
            const refresh = await this.refreshSupervisorRuntime();
            if (refresh.status !== 0) {
              observer.onLog?.(
                LogLevel.WARN,
                'SETUP',
                `   - Supervisor refresh failed on attempt ${attempt}: ${this.describeExecResult(refresh)}`,
              );
              await new Promise((resolve) => setTimeout(resolve, 3000));
              continue;
            }
            supervisorRefreshComplete = true;
          }

          const state = await this.inspectSupervisorContainer();
          if (state.status === 'running' && !state.restarting) {
            updateUI(steps[4]!, true);
            step = 5;
            continue;
          }
          if (
            state.restarting ||
            state.status === 'restarting' ||
            state.status === 'exited' ||
            state.status === 'dead'
          ) {
            const logs = await this.getSupervisorLogs();
            updateUI(steps[4]!, false, true);
            observer.onLog?.(
              LogLevel.ERROR,
              'SETUP',
              `   - Station supervisor is crash-looping: status=${state.status} observedStatus=${state.observedStatus} restarting=${state.restarting} restartCount=${state.restartCount}`,
            );
            if (logs) {
              observer.onLog?.(
                LogLevel.ERROR,
                'SETUP',
                `   - Supervisor logs: ${logs}`,
              );
            }
            return false;
          }
          observer.onLog?.(
            LogLevel.WARN,
            'SETUP',
            `   - Supervisor container not ready on attempt ${attempt}: status=${state.status} observedStatus=${state.observedStatus} restarting=${state.restarting} restartCount=${state.restartCount}`,
          );
        }

        // Step 6: API Connectivity
        if (step === 5) {
          const state = await this.inspectSupervisorContainer();
          if (
            state.restarting ||
            state.status === 'restarting' ||
            state.status === 'exited' ||
            state.status === 'dead'
          ) {
            const logs = await this.getSupervisorLogs();
            updateUI(steps[5]!, false, true);
            observer.onLog?.(
              LogLevel.ERROR,
              'SETUP',
              `   - Station supervisor crashed before API became ready: status=${state.status} observedStatus=${state.observedStatus} restarting=${state.restarting} restartCount=${state.restartCount}`,
            );
            if (logs) {
              observer.onLog?.(
                LogLevel.ERROR,
                'SETUP',
                `   - Supervisor logs: ${logs}`,
              );
            }
            return false;
          }
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

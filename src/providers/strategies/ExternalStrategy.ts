/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseStrategy } from './BaseStrategy.js';
import { spawnSync } from 'node:child_process';
import { logger } from '../../core/Logger.js';

export class ExternalStrategy extends BaseStrategy {
  getBackendType(): string {
    return 'external';
  }

  getMagicRemote(): string {
    const user = this.getStandardUser();
    return this.overrideHost
      ? `${user}@${this.overrideHost}`
      : `${user}@nic0.${this.instanceName}.${this.zone}.c.${this.projectId}.internal`;
  }

  getRunCommand(
    command: string,
    options: { interactive?: boolean } = {},
  ): string {
    // For external, gcloud is preferred as it handles auth better
    return `gcloud --verbosity=error compute ssh ${this.instanceName} --project ${this.projectId} --zone ${this.zone} --quiet --command ${this.quote(command)}${options.interactive ? ' --ssh-flag="-t" --ssh-flag="-o LogLevel=ERROR"' : ' --ssh-flag="-o LogLevel=ERROR"'}`;
  }

  getRunArgs(
    command: string,
    options: { interactive?: boolean } = {},
  ): string[] {
    const args = [
      '--verbosity=error',
      'compute',
      'ssh',
      this.instanceName,
      '--project',
      this.projectId,
      '--zone',
      this.zone,
      '--quiet',
      '--command',
      command,
    ];
    args.push('--ssh-flag="-o LogLevel=ERROR"');
    if (options.interactive) {
      args.push('--ssh-flag="-t"');
    }
    return args;
  }

  getNetworkInterfaceArgs(vpcName: string, subnetName: string): string[] {
    const addressName = `${this.instanceName}-ip`;
    const region = this.zone.split('-').slice(0, 2).join('-');

    logger.info(`📡 Ensuring static EXTERNAL IP: ${addressName}...`);
    const res = spawnSync(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'addresses',
        'create',
        addressName,
        '--project',
        this.projectId,
        '--region',
        region,
        '--quiet',
      ],
      { stdio: 'pipe' },
    );

    if (res.status !== 0) {
      const stderr = res.stderr.toString();
      if (!stderr.includes('already exists')) {
        logger.error(`❌ Failed to ensure static IP: ${stderr}`);
      }
    }

    return [
      '--network-interface',
      `network=${vpcName},subnet=${subnetName},address=${addressName}`,
    ];
  }

  async onProvisioned(): Promise<void> {
    logger.info('   - Fetching external IP for connection...');
    const res = spawnSync(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'describe',
        this.instanceName,
        '--project',
        this.projectId,
        '--zone',
        this.zone,
        '--quiet',
        '--format',
        'get(networkInterfaces[0].accessConfigs[0].natIP)',
      ],
      { stdio: 'pipe' },
    );
    logger.logOutput(res.stdout, res.stderr);

    if (res.status === 0 && res.stdout) {
      const ip = res.stdout.toString().trim();
      if (ip) {
        logger.info(`   📡 Using external IP: ${ip}`);
        this.setOverrideHost(ip);
      }
    }
  }
}

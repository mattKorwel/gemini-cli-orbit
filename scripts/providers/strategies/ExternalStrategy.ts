/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseStrategy } from './BaseStrategy.js';
import { spawnSync } from 'node:child_process';
import { logger } from '../../Logger.js';

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

  getNetworkInterfaceConfig(vpcName: string, subnetName: string): string {
    const addressName = `${this.instanceName}-ip`;
    const region = this.zone.split('-').slice(0, 2).join('-');

    logger.info(`📡 Ensuring static EXTERNAL IP: ${addressName}...`);
    spawnSync(
      'gcloud',
      [
        'compute',
        'addresses',
        'create',
        addressName,
        '--project',
        this.projectId,
        '--region',
        region,
      ],
      { stdio: 'pipe' },
    );

    return `network=${vpcName},subnet=${subnetName},address=${addressName}`;
  }

  async onProvisioned(): Promise<void> {
    logger.info('   - Fetching external IP for connection...');
    const res = spawnSync(
      'gcloud',
      [
        'compute',
        'instances',
        'describe',
        this.instanceName,
        '--project',
        this.projectId,
        '--zone',
        this.zone,
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

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseStrategy } from './BaseStrategy.ts';
import { spawnSync } from 'node:child_process';

export class IapStrategy extends BaseStrategy {
  getBackendType(): string {
    return 'iap';
  }

  getMagicRemote(): string {
    return this.instanceName;
  }

  getCommonArgs(): string[] {
    return [];
  }

  getRunCommand(command: string, options: { interactive?: boolean }): string {
    const iapArgs = [
      'gcloud', 'compute', 'ssh', this.getMagicRemote(),
      '--project', this.projectId,
      '--zone', this.zone,
      '--tunnel-through-iap',
      '--command', this.quote(command)
    ];
    return iapArgs.join(' ');
  }

  setupNetworkInfrastructure(vpcName: string): void {
    // IAP requires the scoped rule
    const iapFwCheck = spawnSync('gcloud', ['compute', 'firewall-rules', 'describe', 'allow-ssh-iap', '--project', this.projectId], { stdio: 'pipe' });
    if (iapFwCheck.status !== 0) {
      console.log('🏗️  Adding IAP Firewall Rule (allow-ssh-iap)...');
      spawnSync('gcloud', [
        'compute', 'firewall-rules', 'create', 'allow-ssh-iap',
        '--project', this.projectId,
        '--network', vpcName,
        '--allow=tcp:22',
        '--source-ranges=35.235.240.0/20'
      ], { stdio: 'inherit' });
    }
  }
}

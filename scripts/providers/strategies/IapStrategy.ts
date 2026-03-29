/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseStrategy } from './BaseStrategy.js';
import { spawnSync } from 'node:child_process';
import { logger } from '../../Logger.js';

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

  getRunCommand(command: string, _options: { interactive?: boolean }): string {
    const iapArgs = [
      'gcloud',
      'compute',
      'ssh',
      this.getMagicRemote(),
      '--project',
      this.projectId,
      '--zone',
      this.zone,
      '--tunnel-through-iap',
      '--command',
      this.quote(command),
    ];
    return iapArgs.join(' ');
  }

  getRunArgs(command: string, _options: { interactive?: boolean }): string[] {
    const args = [
      'gcloud',
      'compute',
      'ssh',
      this.getMagicRemote(),
      '--project',
      this.projectId,
      '--zone',
      this.zone,
      '--tunnel-through-iap',
      '--command',
      command,
    ];
    // gcloud doesn't need the -t flag as it manages it via tty presence
    return args;
  }

  setupNetworkInfrastructure(vpcName: string): void {
    // IAP requires the scoped rule
    const iapFwCheck = spawnSync(
      'gcloud',
      [
        'compute',
        'firewall-rules',
        'describe',
        'allow-ssh-iap',
        '--project',
        this.projectId,
      ],
      { stdio: 'pipe' },
    );
    logger.logOutput(iapFwCheck.stdout, iapFwCheck.stderr);
    if (iapFwCheck.status !== 0) {
      logger.info('🏗️  Adding IAP Firewall Rule (allow-ssh-iap)...');
      spawnSync(
        'gcloud',
        [
          'compute',
          'firewall-rules',
          'create',
          'allow-ssh-iap',
          '--project',
          this.projectId,
          '--network',
          vpcName,
          '--allow=tcp:22',
          '--source-ranges=35.235.240.0/20',
        ],
        { stdio: 'inherit' },
      );
    }
  }
}

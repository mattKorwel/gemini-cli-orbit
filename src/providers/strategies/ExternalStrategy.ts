/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseStrategy } from './BaseStrategy.js';

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
    // Prepended environment variables to suppress informational noise
    const envPrefix = 'CLOUDSDK_CORE_VERBOSITY=error ';
    return `${envPrefix}gcloud compute ssh ${this.instanceName} --project ${this.projectId} --zone ${this.zone} --quiet --command ${this.quote(command)}${options.interactive ? ' --ssh-flag="-t" --ssh-flag="-o LogLevel=ERROR"' : ' --ssh-flag="-o LogLevel=ERROR"'}`;
  }

  getRunArgs(
    command: string,
    options: { interactive?: boolean } = {},
  ): string[] {
    // Note: getRunArgs is used by spawnSync without shell, so env vars must be handled differently
    // For now, we'll rely on the command-line flags
    const args = [
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
}

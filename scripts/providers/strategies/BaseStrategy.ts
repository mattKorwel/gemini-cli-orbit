/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'os';
import type { ConnectivityStrategy } from './ConnectivityStrategy.ts';
import { spawnSync } from 'node:child_process';

export abstract class BaseStrategy implements ConnectivityStrategy {
  protected overrideHost: string | null = null;

  constructor(
    public projectId: string,
    public zone: string,
    protected instanceName: string,
    protected config: { dnsSuffix?: string, userSuffix?: string, backendType?: string } = {}
  ) {}

  abstract getMagicRemote(): string;
  abstract getBackendType(): string;

  setOverrideHost(host: string | null): void {
    this.overrideHost = host;
  }

  getCommonArgs(): string[] {
    return [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'GlobalKnownHostsFile=/dev/null',
      '-o', 'CheckHostIP=no',
      '-o', 'LogLevel=ERROR',
      '-o', 'ConnectTimeout=60',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'ControlMaster=auto',
      '-o', 'ControlPath=~/.ssh/gcli-%C',
      '-o', 'ControlPersist=10m',
      '-o', 'SendEnv=USER',
      '-i', `${os.homedir()}/.ssh/google_compute_engine`,
    ];
  }

  getRunCommand(command: string, options: { interactive?: boolean }): string {
    return `ssh ${this.getCommonArgs().join(' ')} ${options.interactive ? '-t' : ''} ${this.getMagicRemote()} ${this.quote(command)}`;
  }

  // Default: Ensure broad corporate SSH rule exists
  setupNetworkInfrastructure(vpcName: string): void {
    const fwCheck = spawnSync('gcloud', ['compute', 'firewall-rules', 'describe', 'allow-corporate-ssh', '--project', this.projectId], { stdio: 'pipe' });
    if (fwCheck.status !== 0) {
        spawnSync('gcloud', [
            'compute', 'firewall-rules', 'create', 'allow-corporate-ssh',
            '--project', this.projectId,
            '--network', vpcName,
            '--allow=tcp:22',
            '--source-ranges=0.0.0.0/0'
        ], { stdio: 'inherit' });
    }
  }

  // Default: No static external IP
  getNetworkInterfaceConfig(vpcName: string, subnetName: string): string {
    return `network=${vpcName},subnet=${subnetName},no-address`;
  }

  // Default: No post-provisioning steps
  async onProvisioned(): Promise<void> {}

  protected quote(str: string): string {
    return `'${str.replace(/'/g, "'\\''")}'`;
  }

  protected getStandardUser(): string {
    const rawUser = process.env.USER || 'node';
    const userSuffix = this.config.userSuffix ?? '';
    return `${rawUser}${userSuffix}`;
  }
}

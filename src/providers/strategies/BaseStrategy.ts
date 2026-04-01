/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'os';
import type { ConnectivityStrategy } from './ConnectivityStrategy.js';
import { spawnSync } from 'node:child_process';
import { logger } from '../../core/Logger.js';

export abstract class BaseStrategy implements ConnectivityStrategy {
  protected overrideHost: string | null = null;

  constructor(
    public projectId: string,
    public zone: string,
    protected instanceName: string,
    protected config: {
      dnsSuffix?: string;
      userSuffix?: string;
      backendType?: string;
    } = {},
  ) {}

  abstract getMagicRemote(): string;
  abstract getBackendType(): string;

  setOverrideHost(host: string | null): void {
    this.overrideHost = host;
  }

  getCommonArgs(): string[] {
    return [
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      'GlobalKnownHostsFile=/dev/null',
      '-o',
      'CheckHostIP=no',
      '-o',
      'LogLevel=ERROR',
      '-o',
      'ConnectTimeout=60',
      '-o',
      'ServerAliveInterval=30',
      '-o',
      'ServerAliveCountMax=3',
      '-o',
      'ControlMaster=auto',
      '-o',
      'ControlPath=~/.ssh/gcli-%C',
      '-o',
      'ControlPersist=10m',
      '-o',
      'SendEnv=USER',
      '-i',
      `${os.homedir()}/.ssh/google_compute_engine`,
    ];
  }

  getRunCommand(command: string, options: { interactive?: boolean }): string {
    return `ssh ${this.getCommonArgs().join(' ')} ${options.interactive ? '-t' : ''} ${this.getMagicRemote()} ${this.quote(command)}`;
  }

  getRunArgs(command: string, options: { interactive?: boolean }): string[] {
    const args = ['ssh', ...this.getCommonArgs()];
    if (options.interactive) args.push('-t');
    args.push(this.getMagicRemote());
    args.push(command);
    return args;
  }

  // Default: Ensure broad corporate SSH rule exists
  setupNetworkInfrastructure(vpcName: string): void {
    const region = this.zone.split('-').slice(0, 2).join('-');
    logger.info(
      `   - Ensuring firewall rule 'allow-corporate-ssh' on ${vpcName}...`,
    );
    const fwCheck = spawnSync(
      'gcloud',
      [
        'compute',
        'firewall-rules',
        'describe',
        'allow-corporate-ssh',
        '--project',
        this.projectId,
      ],
      { stdio: 'pipe' },
    );
    logger.logOutput(fwCheck.stdout, fwCheck.stderr);
    if (fwCheck.status !== 0) {
      const sourceRanges =
        (this.config as any).sshSourceRanges?.join(',') || '0.0.0.0/0';
      spawnSync(
        'gcloud',
        [
          'compute',
          'firewall-rules',
          'create',
          'allow-corporate-ssh',
          '--project',
          this.projectId,
          '--network',
          vpcName,
          '--allow=tcp:22',
          `--source-ranges=${sourceRanges}`,
        ],
        { stdio: 'inherit' },
      );
    }

    logger.info(`   - Ensuring Cloud NAT for internet access in ${region}...`);
    const routerName = `${vpcName}-router`;
    const natName = `${vpcName}-nat`;

    const routerCheck = spawnSync(
      'gcloud',
      [
        'compute',
        'routers',
        'describe',
        routerName,
        '--project',
        this.projectId,
        '--region',
        region,
      ],
      { stdio: 'pipe' },
    );
    logger.logOutput(routerCheck.stdout, routerCheck.stderr);
    if (routerCheck.status !== 0) {
      spawnSync(
        'gcloud',
        [
          'compute',
          'routers',
          'create',
          routerName,
          '--project',
          this.projectId,
          '--network',
          vpcName,
          '--region',
          region,
        ],
        { stdio: 'inherit' },
      );
    }

    const natCheck = spawnSync(
      'gcloud',
      [
        'compute',
        'routers',
        'nats',
        'describe',
        natName,
        '--router',
        routerName,
        '--project',
        this.projectId,
        '--region',
        region,
      ],
      { stdio: 'pipe' },
    );
    logger.logOutput(natCheck.stdout, natCheck.stderr);
    if (natCheck.status !== 0) {
      spawnSync(
        'gcloud',
        [
          'compute',
          'routers',
          'nats',
          'create',
          natName,
          '--project',
          this.projectId,
          '--router',
          routerName,
          '--region',
          region,
          '--auto-allocate-nat-external-ips',
          '--nat-all-subnet-ip-ranges',
        ],
        { stdio: 'inherit' },
      );
    }
  }

  // Default: No static external IP
  getNetworkInterfaceArgs(vpcName: string, subnetName: string): string[] {
    return [
      '--network-interface',
      `network=${vpcName},subnet=${subnetName},no-address`,
    ];
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

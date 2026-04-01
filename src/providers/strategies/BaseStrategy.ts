/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import type { ConnectivityStrategy } from './ConnectivityStrategy.js';

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

  getRunCommand(command: string, options: { interactive?: boolean | undefined } = {}): string {
    return `ssh ${this.getCommonArgs().join(' ')} ${options.interactive ? '-t' : ''} ${this.getMagicRemote()} ${this.quote(command)}`;
  }

  getRunArgs(command: string, options: { interactive?: boolean | undefined } = {}): string[] {
    const args = ['ssh', ...this.getCommonArgs()];
    if (options.interactive) args.push('-t');
    args.push(this.getMagicRemote());
    args.push(command);
    return args;
  }

  /**
   * Hook called after successful instance creation.
   */
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

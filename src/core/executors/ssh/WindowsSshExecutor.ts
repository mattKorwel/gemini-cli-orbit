/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import { SshExecutor } from './SshExecutor.js';

/**
 * WindowsSshExecutor: Windows-specific SSH execution that avoids OpenSSH
 * multiplexing flags, which are unreliable in this environment.
 */
export class WindowsSshExecutor extends SshExecutor {
  protected override getCommonArgs(): string[] {
    return [
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=NUL',
      '-o',
      'GlobalKnownHostsFile=NUL',
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
      '-i',
      `${os.homedir()}/.ssh/google_compute_engine`,
    ];
  }
}

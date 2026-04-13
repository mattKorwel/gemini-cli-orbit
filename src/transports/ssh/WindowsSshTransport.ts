/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import { SshTransport } from './SshTransport.js';

export class WindowsSshTransport extends SshTransport {
  protected override getTunnelArgs(
    target: string,
    localPort: number,
    remotePort: number,
  ): string[] {
    const home = os.homedir();
    return [
      '-i',
      `${home}/.ssh/google_compute_engine`,
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=NUL',
      '-L',
      `${localPort}:localhost:${remotePort}`,
      '-N',
      target,
    ];
  }
}

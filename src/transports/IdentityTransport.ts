/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type StationTransport,
  type IProcessManager,
} from '../core/interfaces.js';
import { type Command } from '../core/executors/types.js';
import {
  type SyncOptions,
  type ExecOptions,
  type ExecResult,
} from '../core/types.js';

/**
 * IdentityTransport: A "Passthrough" transport for local execution.
 * Directly executes commands on the host machine using ProcessManager.
 */
export class IdentityTransport implements StationTransport {
  public readonly type = 'identity';

  constructor(private readonly pm: IProcessManager) {}

  async exec(
    command: string | Command,
    options: ExecOptions = {},
  ): Promise<ExecResult> {
    const bin = typeof command === 'string' ? command : command.bin;
    const args = typeof command === 'string' ? [] : command.args;
    const runOpts = {
      ...options,
      ...(typeof command === 'string' ? {} : command.options),
    };

    return this.pm.run(bin, args, runOpts);
  }

  async attach(containerName: string, sessionName: string): Promise<number> {
    console.info(
      `📡 Direct Attach: Joining mission '${containerName}' on local Docker...`,
    );

    // In identity mode, we run docker exec directly.
    // Use runSync to ensure the terminal (TTY) is passed through correctly.
    const res = this.pm.runSync(
      'docker',
      ['exec', '-it', containerName, 'tmux', 'attach', '-t', sessionName],
      {
        interactive: true,
      },
    );

    return res.status;
  }

  async sync(
    _localPath: string,
    _remotePath: string,
    _options?: SyncOptions,
  ): Promise<number> {
    // In identity mode, local is host, so no sync is needed
    return 0;
  }

  async ensureTunnel(_localPort: number, _remotePort: number): Promise<void> {
    // No tunnel needed for local execution
    return;
  }

  getConnectionHandle(): string {
    return 'localhost (direct)';
  }

  setOverrideHost(_host: string): void {
    // No-op for identity transport
  }

  getMagicRemote(): string {
    return 'localhost';
  }
}

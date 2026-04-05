/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { logger } from './Logger.js';
import {
  type IProcessManager,
  type IProcessResult,
  type IRunOptions,
} from './interfaces.js';

/**
 * ProcessManager: Centralized utility for consistent process execution.
 */
export class ProcessManager implements IProcessManager {
  /**
   * Runs a command synchronously.
   */
  public runSync(
    bin: string,
    args: string[],
    options: IRunOptions = {},
  ): IProcessResult {
    const { cwd, env, interactive, quiet } = options;

    if (!quiet) {
      logger.info('EXEC', `🏃 Running: ${bin} ${args.join(' ')}`);
    }

    const spawnOptions: SpawnSyncOptions = {
      cwd,
      env: { ...process.env, ...env },
      stdio:
        options.stdio || (interactive ? 'inherit' : quiet ? 'pipe' : 'inherit'),
      shell: false,
    };

    const res = spawnSync(bin, args, spawnOptions);

    return {
      status: res.status ?? (res.error ? 1 : 0),
      stdout: res.stdout?.toString() || '',
      stderr: res.stderr?.toString() || '',
    };
  }

  /**
   * Legacy static support
   */
  public static runSync(
    bin: string,
    args: string[],
    options: IRunOptions = {},
  ): IProcessResult {
    return new ProcessManager().runSync(bin, args, options);
  }

  /**
   * Runs a command asynchronously (Legacy/Background support).
   */
  public runAsync(bin: string, args: string[], options: IRunOptions = {}) {
    const { cwd, env } = options;

    return spawn(bin, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      detached: true,
    });
  }

  /**
   * Legacy static support
   */
  public static runAsync(
    bin: string,
    args: string[],
    options: IRunOptions = {},
  ) {
    return new ProcessManager().runAsync(bin, args, options);
  }
}

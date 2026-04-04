/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { logger } from './Logger.js';

export interface ProcessResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  interactive?: boolean;
  quiet?: boolean;
}

/**
 * ProcessManager: Centralized utility for consistent process execution.
 */
export class ProcessManager {
  /**
   * Runs a command synchronously.
   */
  public static runSync(
    bin: string,
    args: string[],
    options: RunOptions = {},
  ): ProcessResult {
    const { cwd, env, interactive, quiet } = options;

    if (!quiet) {
      logger.info('EXEC', `🏃 Running: ${bin} ${args.join(' ')}`);
    }

    const spawnOptions: SpawnSyncOptions = {
      cwd,
      env: { ...process.env, ...env },
      stdio: interactive ? 'inherit' : quiet ? 'pipe' : 'inherit',
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
   * Runs a command asynchronously (Legacy/Background support).
   */
  public static runAsync(
    bin: string,
    args: string[],
    options: RunOptions = {},
  ) {
    const { cwd, env } = options;

    return spawn(bin, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      detached: true,
    });
  }
}

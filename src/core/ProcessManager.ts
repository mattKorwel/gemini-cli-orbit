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
  constructor(
    private readonly defaultOptions: IRunOptions = {},
    private readonly useSudo: boolean = false,
  ) {}

  /**
   * Runs a command synchronously.
   */
  public runSync(
    bin: string,
    args: string[],
    options: IRunOptions = {},
  ): IProcessResult {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const { cwd, env, interactive, quiet } = mergedOptions;

    let effectiveBin = bin;
    let effectiveArgs = [...args];

    if (this.useSudo && bin !== 'sudo') {
      effectiveBin = 'sudo';
      effectiveArgs = [bin, ...args];
    }

    if (!quiet) {
      logger.info(
        'EXEC',
        `🏃 Running: ${effectiveBin} ${effectiveArgs.join(' ')}`,
      );
    }

    const spawnOptions: SpawnSyncOptions = {
      cwd,
      env: { ...process.env, ...env },
      stdio:
        mergedOptions.stdio ||
        (interactive ? 'inherit' : quiet ? 'pipe' : 'inherit'),
      shell: false,
    };

    const res = spawnSync(effectiveBin, effectiveArgs, spawnOptions);

    return {
      status: res.status ?? (res.error ? 1 : 0),
      stdout: res.stdout?.toString() || '',
      stderr: res.stderr?.toString() || '',
    };
  }

  /**
   * Runs a command asynchronously (Legacy/Background support).
   * @deprecated Use runAsync or spawn
   */
  public runAsync(bin: string, args: string[], options: IRunOptions = {}) {
    return this.spawn(bin, args, options);
  }

  /**
   * Spawns a process.
   */
  public spawn(bin: string, args: string[], options: IRunOptions = {}) {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const { cwd, env } = mergedOptions;

    let effectiveBin = bin;
    let effectiveArgs = [...args];

    if (this.useSudo && bin !== 'sudo') {
      effectiveBin = 'sudo';
      effectiveArgs = [bin, ...args];
    }

    return spawn(effectiveBin, effectiveArgs, {
      cwd,
      env: { ...process.env, ...env },
      stdio: mergedOptions.stdio || 'inherit',
      detached: true,
    });
  }

  /**
   * Returns a promise that resolves when the process exits.
   */
  public async run(
    bin: string,
    args: string[],
    options: IRunOptions = {},
  ): Promise<IProcessResult> {
    return new Promise((resolve) => {
      const child = this.spawn(bin, args, { ...options, stdio: 'pipe' });
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => (stdout += data.toString()));
      child.stderr?.on('data', (data) => (stderr += data.toString()));

      child.on('close', (status) => {
        resolve({
          status: status ?? 0,
          stdout,
          stderr,
        });
      });

      child.on('error', (err) => {
        resolve({
          status: 1,
          stdout,
          stderr: stderr + err.message,
        });
      });
    });
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

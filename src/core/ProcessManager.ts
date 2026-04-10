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
    } else {
      logger.debug(
        'EXEC',
        `🏃 Running: ${effectiveBin} ${effectiveArgs.join(' ')}`,
      );
    }

    if (process.env.GCLI_ORBIT_VERBOSE === '1') {
      logger.debug('EXEC', `   Environment: ${JSON.stringify(env)}`);
    }

    const spawnOptions: SpawnSyncOptions = {
      cwd,
      env: { ...process.env, ...env },
      stdio:
        mergedOptions.stdio ||
        (interactive ? 'inherit' : quiet ? 'pipe' : 'inherit'),
      shell: false,
    };

    if (process.env.GCLI_ORBIT_VERBOSE === '1') {
      logger.debug('EXEC', `   Environment PATH: ${spawnOptions.env?.PATH}`);
    }

    const res = spawnSync(effectiveBin, effectiveArgs, spawnOptions);

    return {
      status: res.status ?? (res.error ? 1 : 0),
      stdout: res.stdout?.toString() || '',
      stderr: res.stderr?.toString() || res.error?.message || '',
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

    if (process.env.GCLI_ORBIT_VERBOSE === '1') {
      logger.debug(
        'EXEC',
        `[DEBUG] ProcessManager.spawn: bin=${effectiveBin}, args=${effectiveArgs.join(' ')}`,
      );
      logger.debug('EXEC', `[DEBUG] ProcessManager.spawn: cwd=${cwd}`);
    }

    try {
      const child = spawn(effectiveBin, effectiveArgs, {
        cwd,
        env: { ...process.env, ...env },
        stdio: mergedOptions.stdio || 'inherit',
        detached: mergedOptions.detached || false,
      });

      child.on('error', (err) => {
        logger.error(
          'EXEC',
          `[DEBUG] ProcessManager.spawn ERROR event: ${err.message}`,
        );
      });

      return child;
    } catch (err: any) {
      logger.error(
        'EXEC',
        `[DEBUG] ProcessManager.spawn THROW: ${err.message}`,
      );
      throw err;
    }
  }

  /**
   * Returns a promise that resolves when the process exits.
   */
  public async run(
    bin: string,
    args: string[],
    options: IRunOptions = {},
  ): Promise<IProcessResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const { onStdout, onStderr } = mergedOptions;

    return new Promise((resolve) => {
      try {
        const child = this.spawn(bin, args, { ...options, stdio: 'pipe' });
        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          const str = data.toString();
          stdout += str;
          if (mergedOptions.stream) {
            process.stdout.write(str);
          }
          onStdout?.(str);
        });

        child.stderr?.on('data', (data) => {
          const str = data.toString();
          stderr += str;
          if (mergedOptions.stream) {
            process.stderr.write(str);
          }
          onStderr?.(str);
        });

        child.on('close', (status) => {
          if (process.env.GCLI_ORBIT_VERBOSE === '1') {
            logger.debug(
              'EXEC',
              `[DEBUG] ProcessManager.run CLOSE: status=${status}`,
            );
          }
          resolve({
            status: status ?? 0,
            stdout,
            stderr,
          });
        });

        child.on('error', (err) => {
          logger.error(
            'EXEC',
            `[DEBUG] ProcessManager.run error event: ${err.message}`,
          );
          resolve({
            status: 1,
            stdout,
            stderr: stderr + err.message,
          });
        });
      } catch (err: any) {
        logger.error(
          'EXEC',
          `[DEBUG] ProcessManager.run try-catch error: ${err.message}`,
        );
        resolve({
          status: 1,
          stdout: '',
          stderr: err.message,
        });
      }
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

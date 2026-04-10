/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import {
  type IProcessManager,
  type IRunOptions,
  type IProcessResult,
} from '../core/interfaces.js';

export interface RecordedProcessCommand {
  kind: 'sync' | 'async' | 'runAsync' | 'spawn';
  bin: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  interactive?: boolean;
}

export interface RecordedProcessHandlerContext {
  kind: RecordedProcessCommand['kind'];
  bin: string;
  args: string[];
  options?: IRunOptions;
  history: RecordedProcessCommand[];
}

export type RecordedProcessHandler = (
  context: RecordedProcessHandlerContext,
) => IProcessResult | undefined | Promise<IProcessResult | undefined>;

function pickEnv(
  env: Record<string, string | undefined> | undefined,
): Record<string, string> | undefined {
  if (!env) return undefined;

  const keys = [
    'HOME',
    'PATH',
    'TERM',
    'COLORTERM',
    'GCLI_TRUST',
    'GCLI_ORBIT_MISSION_ID',
    'GCLI_ORBIT_ACTION',
    'GCLI_ORBIT_SESSION_NAME',
  ];

  const picked = Object.fromEntries(
    keys
      .filter((key) => typeof env[key] === 'string')
      .map((key) => [key, env[key] as string]),
  );

  return Object.keys(picked).length > 0 ? picked : undefined;
}

function createChildProcessStub(
  result: IProcessResult,
): import('node:child_process').ChildProcess {
  const child = new EventEmitter() as import('node:child_process').ChildProcess;
  child.stdout = null;
  child.stderr = null;
  child.stdin = null;
  child.kill = (() => true) as any;
  queueMicrotask(() => {
    child.emit('exit', result.status, null);
    child.emit('close', result.status, null);
  });
  return child;
}

export class RecordingProcessManager implements IProcessManager {
  public readonly history: RecordedProcessCommand[] = [];

  constructor(
    private readonly handler?: RecordedProcessHandler,
    private readonly defaultResult: IProcessResult = {
      status: 0,
      stdout: '',
      stderr: '',
    },
  ) {}

  private record(
    kind: RecordedProcessCommand['kind'],
    bin: string,
    args: string[],
    options?: IRunOptions,
  ): RecordedProcessHandlerContext {
    const command: RecordedProcessCommand = {
      kind,
      bin,
      args: [...args],
    };
    if (options?.cwd) command.cwd = options.cwd;
    const env = pickEnv(
      options?.env as Record<string, string | undefined> | undefined,
    );
    if (env) command.env = env;
    if (options?.interactive) command.interactive = true;
    this.history.push(command);
    const context: RecordedProcessHandlerContext = {
      kind,
      bin,
      args,
      history: this.history,
    };
    if (options) context.options = options;
    return context;
  }

  private resolveResultSync(
    kind: RecordedProcessCommand['kind'],
    bin: string,
    args: string[],
    options?: IRunOptions,
  ): IProcessResult {
    const handled = this.handler?.(this.record(kind, bin, args, options));
    if (
      handled &&
      typeof (handled as Promise<IProcessResult | undefined>).then ===
        'function'
    ) {
      throw new Error(
        'RecordingProcessManager.runSync handler returned a Promise',
      );
    }
    return (handled as IProcessResult | undefined) ?? this.defaultResult;
  }

  private async resolveResultAsync(
    kind: RecordedProcessCommand['kind'],
    bin: string,
    args: string[],
    options?: IRunOptions,
  ): Promise<IProcessResult> {
    const handled = await this.handler?.(this.record(kind, bin, args, options));
    return handled ?? this.defaultResult;
  }

  runSync(bin: string, args: string[], options?: IRunOptions): IProcessResult {
    return this.resolveResultSync('sync', bin, args, options);
  }

  async run(
    bin: string,
    args: string[],
    options?: IRunOptions,
  ): Promise<IProcessResult> {
    return this.resolveResultAsync('async', bin, args, options);
  }

  runAsync(
    bin: string,
    args: string[],
    options?: IRunOptions,
  ): import('node:child_process').ChildProcess {
    const result = this.runSync(bin, args, options);
    return createChildProcessStub(result);
  }

  spawn(
    bin: string,
    args: string[],
    options?: IRunOptions,
  ): import('node:child_process').ChildProcess {
    const result = this.runSync(bin, args, options);
    return createChildProcessStub(result);
  }
}

export function formatRecordedCommands(
  history: RecordedProcessCommand[],
  replacements: Record<string, string> = {},
): string[] {
  const normalizedReplacements = Object.entries(replacements)
    .map(([from, to]) => [from.replace(/\\/g, '/'), to] as const)
    .sort((a, b) => b[0].length - a[0].length);

  const normalize = (value: string): string => {
    let next = value.replace(/\\/g, '/');
    for (const [from, to] of normalizedReplacements) {
      next = next.split(from).join(to);
    }
    return next;
  };

  return history.map((command) => {
    const parts = [`${command.kind}:`, command.bin, ...command.args].map(
      (part) => normalize(part),
    );
    const metadata: string[] = [];
    if (command.cwd) metadata.push(`cwd=${normalize(command.cwd)}`);
    if (command.interactive) metadata.push('interactive=true');
    if (command.env) {
      const envPairs = Object.entries(command.env)
        .map(([key, value]) => `${key}=${normalize(value)}`)
        .join(', ');
      metadata.push(`env={${envPairs}}`);
    }
    return metadata.length > 0
      ? `${parts.join(' ')} [${metadata.join(' | ')}]`
      : parts.join(' ');
  });
}

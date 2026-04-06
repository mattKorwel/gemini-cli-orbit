/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Command } from './types.js';
import {
  type IRunOptions,
  type IDockerExecutor,
  type IProcessManager,
  type IProcessResult,
} from '../interfaces.js';

export class DockerExecutor implements IDockerExecutor {
  constructor(private readonly pm: IProcessManager) {}

  public exec(
    container: string,
    innerCommand: string[],
    options: IRunOptions = {},
  ): IProcessResult {
    const cmd = DockerExecutor.exec(container, innerCommand, options);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options);
  }

  public run(
    image: string,
    command?: string,
    options: IRunOptions & {
      name?: string;
      mounts?: { host: string; capsule: string; readonly?: boolean }[];
      label?: string;
    } = {},
  ): Command {
    const { name, mounts, label, env, quiet } = options;
    const args = ['run', '-d'];

    if (name) args.push('--name', name);
    if (label) args.push('--label', label);

    if (mounts) {
      mounts.forEach((m) => {
        args.push('-v', `${m.host}:${m.capsule}${m.readonly ? ':ro' : ''}`);
      });
    }

    if (env) {
      Object.entries(env).forEach(([k, v]) => {
        args.push('-e', `${k}=${v}`);
      });
    }

    args.push(image);
    if (command) {
      args.push('/bin/bash', '-c', command);
    }

    const runOptions: IRunOptions = {};
    if (quiet !== undefined) {
      runOptions.quiet = quiet;
    }

    return {
      bin: 'sudo docker',
      args,
      options: runOptions,
    };
  }

  public stop(container: string): Command {
    return {
      bin: 'sudo docker',
      args: ['stop', container],
    };
  }

  public remove(container: string): Command {
    return {
      bin: 'sudo docker',
      args: ['rm', '-f', container],
    };
  }

  // --- Static Metadata Helpers ---

  public static exec(
    container: string,
    innerCommand: string[],
    options: IRunOptions = {},
  ): Command {
    const { interactive, cwd, env } = options;
    const args = ['exec'];

    if (interactive) args.push('-it');
    if (cwd) args.push('-w', cwd);
    if (env) {
      Object.entries(env).forEach(([k, v]) => {
        args.push('-e', `${k}=${v}`);
      });
    }

    args.push(container, ...innerCommand);

    const runOptions: IRunOptions = { ...options };
    delete runOptions.env;
    delete runOptions.cwd;

    return {
      bin: 'sudo docker',
      args,
      options: runOptions,
    };
  }
}

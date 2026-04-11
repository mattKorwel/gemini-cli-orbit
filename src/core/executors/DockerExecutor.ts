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

/**
 * DockerExecutor: High-level wrapper for Docker commands.
 */
export class DockerExecutor implements IDockerExecutor {
  constructor(
    private readonly pm: IProcessManager,
    private readonly binName: string = 'docker',
  ) {}

  public ps(options: { filter?: string; format?: string } = {}): Command {
    const args: string[] = [];
    if (process.env.DOCKER_HOST) {
      args.push('-H', process.env.DOCKER_HOST);
    }
    args.push('ps');
    if (options.format) args.push('--format', options.format);
    if (options.filter) args.push('--filter', options.filter);

    return {
      bin: this.binName,
      args,
      options: {
        env: { DOCKER_HOST: process.env.DOCKER_HOST || '' },
      },
    };
  }

  public logs(container: string, options: { tail?: string } = {}): Command {
    const args: string[] = [];
    if (process.env.DOCKER_HOST) {
      args.push('-H', process.env.DOCKER_HOST);
    }
    args.push('logs');
    if (options.tail) args.push('--tail', options.tail);
    args.push(container);

    return {
      bin: this.binName,
      args,
      options: {
        env: { DOCKER_HOST: process.env.DOCKER_HOST || '' },
      },
    };
  }

  public exec(
    container: string,
    innerCommand: string[],
    options: IRunOptions = {},
  ): IProcessResult {
    const cmd = DockerExecutor.exec(container, innerCommand, {
      ...options,
      bin: this.binName,
    } as any);
    return this.pm.runSync(this.binName, cmd.args, cmd.options);
  }

  public run(
    image: string,
    command?: string,
    options: IRunOptions & {
      name?: string;
      user?: string | undefined;
      mounts?: { host: string; capsule: string; readonly?: boolean }[];
      label?: string;
      groupAdd?: string;
      ports?: { host: number; container: number }[];
    } = {},
  ): Command {
    const {
      name,
      user,
      mounts,
      label,
      env,
      quiet,
      interactive,
      groupAdd,
      ports,
    } = options;
    const args: string[] = [];

    // Explicitly add Host flag if environment variable exists
    if (process.env.DOCKER_HOST) {
      args.push('-H', process.env.DOCKER_HOST);
    }

    args.push('run', '-d');

    if (interactive) args.push('-it');
    if (name) args.push('--name', name);
    if (user) args.push('--user', user);
    if (label) args.push('--label', label);
    if (groupAdd) args.push('--group-add', groupAdd);

    if (ports) {
      ports.forEach((p) => {
        args.push('-p', `${p.host}:${p.container}`);
      });
    }

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

    const runOptions: IRunOptions = {
      env: {
        ...options.env,
        DOCKER_HOST: process.env.DOCKER_HOST || '',
      },
    };
    if (quiet !== undefined) {
      runOptions.quiet = quiet;
    }

    return {
      bin: this.binName,
      args,
      options: runOptions,
    };
  }

  public stop(container: string): Command {
    const args: string[] = [];
    if (process.env.DOCKER_HOST) {
      args.push('-H', process.env.DOCKER_HOST);
    }
    args.push('stop', container);

    return {
      bin: this.binName,
      args,
      options: {
        env: { DOCKER_HOST: process.env.DOCKER_HOST || '' },
      },
    };
  }

  public remove(container: string): Command {
    const args: string[] = [];
    if (process.env.DOCKER_HOST) {
      args.push('-H', process.env.DOCKER_HOST);
    }
    args.push('rm', '-f', container);

    return {
      bin: this.binName,
      args,
      options: {
        env: { DOCKER_HOST: process.env.DOCKER_HOST || '' },
      },
    };
  }

  public rm(container: string, options: { force?: boolean } = {}): Command {
    const args: string[] = [];
    if (process.env.DOCKER_HOST) {
      args.push('-H', process.env.DOCKER_HOST);
    }
    args.push('rm');
    if (options.force) args.push('--force');
    args.push(container);

    return {
      bin: this.binName,
      args,
      options: {
        env: { DOCKER_HOST: process.env.DOCKER_HOST || '' },
      },
    };
  }

  // --- Static Metadata Helpers ---

  public static exec(
    container: string,
    innerCommand: string[],
    options: IRunOptions & { bin?: string } = {},
  ): Command {
    const args: string[] = [];

    if (process.env.DOCKER_HOST) {
      args.push('-H', process.env.DOCKER_HOST);
    }

    args.push('exec');
    if (options.interactive) args.push('-it');

    const env = {
      ...options.env,
      DOCKER_HOST: process.env.DOCKER_HOST || '',
    };

    if (env) {
      Object.entries(env).forEach(([k, v]) => {
        if (v) args.push('-e', `${k}=${v}`);
      });
    }

    args.push(container, ...innerCommand);

    const runOptions: IRunOptions = { ...options };
    delete runOptions.env;
    delete (runOptions as any).bin;
    delete runOptions.cwd;
    runOptions.env = env;

    return {
      bin: options.bin || 'docker',
      args,
      options: runOptions,
    };
  }
}

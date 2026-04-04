/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Command } from './types.js';
import { type RunOptions } from '../ProcessManager.js';

export class DockerExecutor {
  public static exec(
    container: string,
    innerCommand: string[],
    options: RunOptions = {},
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

    const runOptions: RunOptions = { ...options };
    delete runOptions.env;
    delete runOptions.cwd;

    return {
      bin: 'sudo docker',
      args,
      options: runOptions,
    };
  }
}

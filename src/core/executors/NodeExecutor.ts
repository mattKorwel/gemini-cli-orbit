/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Command } from './types.js';
import { type IRunOptions } from '../interfaces.js';

export class NodeExecutor {
  /**
   * Creates a command to run a Node.js script.
   */
  public static create(
    scriptPath: string,
    args: string[] = [],
    options: IRunOptions = {},
  ): Command {
    return {
      bin: process.execPath,
      args: [scriptPath, ...args],
      options,
    };
  }
}

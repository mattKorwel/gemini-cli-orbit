/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Command } from './types.js';
import {
  type IRunOptions,
  type INodeExecutor,
  type IProcessManager,
} from '../interfaces.js';

export class NodeExecutor implements INodeExecutor {
  constructor(private readonly _pm: IProcessManager) {}

  /**
   * Creates a command to run a Node.js script.
   */
  public create(
    scriptPath: string,
    args: string[] = [],
    options: IRunOptions = {},
  ): Command {
    return NodeExecutor.create(scriptPath, args, options);
  }

  /**
   * Creates a command to run a Node.js script on a remote host (Generic 'node').
   */
  public createRemote(
    scriptPath: string,
    args: string[] = [],
    options: IRunOptions = {},
  ): Command {
    return NodeExecutor.createRemote(scriptPath, args, options);
  }

  // --- Static Metadata Helpers ---

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

  /**
   * Creates a command to run a Node.js script on a remote host (Generic 'node').
   */
  public static createRemote(
    scriptPath: string,
    args: string[] = [],
    options: IRunOptions = {},
  ): Command {
    return {
      bin: 'node',
      args: [scriptPath, ...args],
      options,
    };
  }
}

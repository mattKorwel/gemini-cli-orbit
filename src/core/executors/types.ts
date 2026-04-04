/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type IRunOptions } from '../interfaces.js';

/**
 * Base structure for all command executors.
 */
export interface Command {
  bin: string;
  args: string[];
  options?: IRunOptions;
}

/**
 * Flattens a Command object into a string for legacy execution.
 */
export function flattenCommand(cmd: string | Command): string {
  if (typeof cmd === 'string') return cmd;
  return `${cmd.bin} ${cmd.args.join(' ')}`;
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type RunOptions } from '../ProcessManager.js';

/**
 * Base structure for all command executors.
 */
export interface Command {
  bin: string;
  args: string[];
  options?: RunOptions;
}

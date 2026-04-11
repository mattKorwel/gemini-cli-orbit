/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Command } from './types.js';
import { GeminiExecutor, type GeminiOptions } from './GeminiExecutor.js';

/**
 * WindowsGeminiExecutor: Specialized implementation for Windows environments.
 * Uses shell: true to leverage .cmd wrappers (like gemini.cmd) for spawn compatibility.
 */
export class WindowsGeminiExecutor extends GeminiExecutor {
  public override create(bin: string, options: GeminiOptions = {}): Command {
    const cmd = super.create(bin, options);
    // On Windows, using shell: true allows cmd.exe to find .cmd/.bat wrappers
    // which correctly bootstrap the underlying CLI.
    return {
      ...cmd,
      options: {
        ...cmd.options,
        shell: true,
      },
    };
  }

  protected override resolveBin(bin: string): string {
    // Keep standard name, shell: true will find gemini.cmd
    return bin;
  }
}

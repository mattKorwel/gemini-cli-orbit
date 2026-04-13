/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Command } from './types.js';
import {
  type IRunOptions,
  type IGeminiExecutor,
  type IProcessManager,
} from '../interfaces.js';

export interface GeminiOptions extends IRunOptions {
  approvalMode?: 'default' | 'auto_edit' | 'yolo' | 'plan';
  policy?: string;
  promptInteractive?: string;
  prompt?: string;
  yolo?: boolean;
  resume?: string;
  hookBeforeAgent?: string;
  hookAfterAgent?: string;
  hookBeforeTool?: string;
  hookNotification?: string;
}

/**
 * GeminiExecutor: Standard Linux implementation for gemini CLI.
 */
export class GeminiExecutor implements IGeminiExecutor {
  constructor(protected readonly _pm: IProcessManager) {}

  public create(bin: string, options: GeminiOptions = {}): Command {
    const {
      approvalMode,
      policy,
      promptInteractive,
      prompt,
      yolo,
      resume,
      ...runOpts
    } = options;
    const args: string[] = [];

    if (approvalMode) args.push('--approval-mode', approvalMode);
    if (policy) args.push('--policy', policy);
    if (yolo) args.push('--yolo');
    if (resume) args.push('--resume', resume);
    if (promptInteractive) args.push('--prompt-interactive', promptInteractive);
    if (prompt) args.push('--prompt', prompt);

    return {
      bin: this.resolveBin(bin),
      args,
      options: runOpts,
    };
  }

  protected resolveBin(bin: string): string {
    return bin;
  }

  /**
   * Static helper for simple cases where an instance isn't available.
   * Prefer using the instance-based create() for platform-aware behavior.
   */
  public static create(bin: string, options: GeminiOptions = {}): Command {
    const pm = null as any; // Static doesn't have PM
    return new GeminiExecutor(pm).create(bin, options);
  }
}

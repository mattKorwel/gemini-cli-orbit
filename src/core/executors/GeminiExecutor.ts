/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Command } from './types.js';
import { type IRunOptions } from '../interfaces.js';

export interface GeminiOptions extends IRunOptions {
  approvalMode?: 'default' | 'auto_edit' | 'yolo' | 'plan';
  policy?: string;
  promptInteractive?: string;
  prompt?: string;
  yolo?: boolean;
}

export class GeminiExecutor {
  public static create(bin: string, options: GeminiOptions = {}): Command {
    const {
      approvalMode,
      policy,
      promptInteractive,
      prompt,
      yolo,
      ...runOpts
    } = options;
    const args: string[] = [];

    if (approvalMode) args.push('--approval-mode', approvalMode);
    if (policy) args.push('--policy', policy);
    if (yolo) args.push('--yolo');
    if (promptInteractive) args.push('--prompt-interactive', promptInteractive);
    if (prompt) args.push('--prompt', prompt);

    return {
      bin,
      args,
      options: runOpts,
    };
  }
}

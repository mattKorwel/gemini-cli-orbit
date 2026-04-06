/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { GeminiExecutor } from './GeminiExecutor.js';

describe('GeminiExecutor', () => {
  it('creates a complex gemini command', () => {
    const cmd = GeminiExecutor.create('/bin/gemini', {
      approvalMode: 'auto_edit',
      policy: 'my.policy',
      promptInteractive: 'Hello',
      resume: 'latest',
    });
    expect(cmd.bin).toBe('/bin/gemini');
    expect(cmd.args).toContain('--approval-mode');
    expect(cmd.args).toContain('auto_edit');
    expect(cmd.args).toContain('--policy');
    expect(cmd.args).toContain('--prompt-interactive');
    expect(cmd.args).toContain('--resume');
    expect(cmd.args).toContain('latest');
  });
});

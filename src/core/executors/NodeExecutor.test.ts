/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { NodeExecutor } from './NodeExecutor.js';

describe('NodeExecutor', () => {
  it('creates a valid node command', () => {
    const cmd = NodeExecutor.create('script.js', ['arg1'], { quiet: true });
    expect(cmd.bin).toBe('node');
    expect(cmd.args).toEqual(['script.js', 'arg1']);
    expect(cmd.options?.quiet).toBe(true);
  });
});

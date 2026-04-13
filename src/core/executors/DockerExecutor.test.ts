/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DockerExecutor } from './DockerExecutor.js';

describe('DockerExecutor', () => {
  it('creates an exec command with env vars', () => {
    const cmd = DockerExecutor.exec('my-cont', ['ls'], { env: { FOO: 'bar' } });
    expect(cmd.bin).toBe('docker');
    expect(cmd.args).toContain('my-cont');
    expect(cmd.args).toContain('FOO=bar');
    expect(cmd.args).toContain('ls');
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SshExecutor } from './SshExecutor.js';

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/Users/testuser',
  },
  homedir: () => '/Users/testuser',
}));

describe('SshExecutor', () => {
  const mockPm: any = {
    runSync: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create an SSH command without double-wrapping the command string', () => {
    const executor = new SshExecutor(mockPm);
    const target = 'user@host';
    const command = 'ls -la';

    const result = executor.create(target, command);

    expect(result.args[result.args.length - 1]).toBe(command);
    expect(result.args).toContain(target);
    expect(result.bin).toBe('ssh');
  });

  it('should include common SSH options and identity file', () => {
    const executor = new SshExecutor(mockPm);
    const result = executor.create('user@host', 'uptime');

    expect(result.args).toContain('-o');
    expect(result.args).toContain('StrictHostKeyChecking=no');
    expect(result.args).toContain('-i');
    expect(result.args[result.args.indexOf('-i') + 1]).toContain(
      '.ssh/google_compute_engine',
    );
  });

  it('should support interactive mode with -t flag', () => {
    const executor = new SshExecutor(mockPm);
    const result = executor.create('user@host', 'top', { interactive: true });

    expect(result.args).toContain('-t');
  });
});

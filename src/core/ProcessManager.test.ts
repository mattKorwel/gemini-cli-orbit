/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessManager } from './ProcessManager.js';
import { spawnSync } from 'node:child_process';

vi.mock('node:child_process');

describe('ProcessManager', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('runSync returns structured result on success', () => {
    (spawnSync as any).mockReturnValue({
      status: 0,
      stdout: Buffer.from('hello'),
      stderr: Buffer.from(''),
    });

    const res = ProcessManager.runSync('echo', ['hello'], { quiet: true });

    expect(res.status).toBe(0);
    expect(res.stdout).toBe('hello');
    expect(spawnSync).toHaveBeenCalledWith(
      'echo',
      ['hello'],
      expect.objectContaining({ stdio: 'pipe' }),
    );
  });

  it('runSync handles errors gracefully', () => {
    (spawnSync as any).mockReturnValue({
      status: 1,
      stdout: Buffer.from(''),
      stderr: Buffer.from('error'),
    });

    const res = ProcessManager.runSync('false', [], { quiet: true });

    expect(res.status).toBe(1);
    expect(res.stderr).toBe('error');
  });

  it('runSync uses inherit stdio for interactive mode', () => {
    (spawnSync as any).mockReturnValue({ status: 0 });

    ProcessManager.runSync('bash', [], { interactive: true });

    expect(spawnSync).toHaveBeenCalledWith(
      'bash',
      [],
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { WindowsSshExecutor } from './WindowsSshExecutor.js';

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/Users/testuser',
    platform: () => 'win32',
  },
  homedir: () => '/Users/testuser',
  platform: () => 'win32',
}));

describe('WindowsSshExecutor', () => {
  it('omits SSH multiplexing flags', () => {
    const mockPm: any = {
      runSync: vi.fn(),
    };

    const executor = new WindowsSshExecutor(mockPm);
    const result = executor.create('user@host', 'uptime');

    expect(result.args).not.toContain('ControlMaster=auto');
    expect(result.args).not.toContain('ControlPath=~/.ssh/orbit-%C');
    expect(result.args).not.toContain('ControlPersist=10m');
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';

export const mockSsh = {
  runHostCommand: vi
    .fn()
    .mockResolvedValue({ status: 0, stdout: '', stderr: '' }),
  runDockerExec: vi
    .fn()
    .mockResolvedValue({ status: 0, stdout: '', stderr: '' }),
  syncPath: vi.fn().mockResolvedValue(0),
  getMagicRemote: vi.fn().mockReturnValue('user@host'),
  getBackendType: vi.fn().mockReturnValue('direct-internal'),
  setOverrideHost: vi.fn(),
  attachToTmux: vi.fn().mockResolvedValue(0),
};

export const SSHManager = vi.fn().mockImplementation(() => mockSsh);

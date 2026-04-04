/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { IntegrationManager } from './IntegrationManager.js';
import { type IShellIntegration } from '../core/interfaces.js';
import fs from 'node:fs';

vi.mock('node:fs');

describe('IntegrationManager', () => {
  let manager: IntegrationManager;
  let shellIntegration: Mocked<IShellIntegration>;
  const observer = { onLog: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    shellIntegration = {
      detectShell: vi.fn(),
      getProfilePath: vi.fn(),
      install: vi.fn(),
    } as any;
    manager = new IntegrationManager(observer as any, shellIntegration);
  });

  it('should install shell integration', async () => {
    // Mock FS to find a shim
    (fs.existsSync as any).mockReturnValue(true);
    shellIntegration.install.mockReturnValue(true);

    await manager.installShell();

    expect(shellIntegration.install).toHaveBeenCalled();
    expect(observer.onLog).toHaveBeenCalledWith(
      expect.any(Number),
      'SETUP',
      expect.stringContaining('successfully'),
    );
  });

  it('should handle installation failure', async () => {
    (fs.existsSync as any).mockReturnValue(true);
    shellIntegration.install.mockReturnValue(false);

    await manager.installShell();

    expect(observer.onLog).toHaveBeenCalledWith(
      expect.any(Number),
      'SETUP',
      expect.stringContaining('Failed'),
    );
  });
});

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
      getAvailableShells: vi.fn().mockReturnValue(['zsh']),
      getProfilePath: vi.fn(),
      getProfilePaths: vi.fn().mockReturnValue(['/home/user/.zshrc']),
      install: vi.fn(),
      isInstalled: vi.fn(),
    } as any;
    manager = new IntegrationManager(observer as any, shellIntegration);
  });

  it('should install shell integration', async () => {
    // Mock FS to find a shim
    (fs.existsSync as any).mockReturnValue(true);
    shellIntegration.install.mockReturnValue(true);
    shellIntegration.getAvailableShells.mockReturnValue(['zsh', 'bash']);

    await manager.installShell();

    expect(shellIntegration.install).toHaveBeenCalledTimes(2);
    expect(observer.onLog).toHaveBeenCalledWith(
      expect.any(Number),
      'SETUP',
      expect.stringContaining('successfully'),
    );
  });

  it('should handle installation failure', async () => {
    (fs.existsSync as any).mockReturnValue(true);
    shellIntegration.install.mockReturnValue(false);
    shellIntegration.getAvailableShells.mockReturnValue(['zsh']);

    await manager.installShell();

    expect(observer.onLog).toHaveBeenCalledWith(
      expect.any(Number),
      'SETUP',
      expect.stringContaining('Failed'),
    );
  });

  it('should return integration status', async () => {
    shellIntegration.detectShell.mockReturnValue('zsh');
    shellIntegration.getProfilePath.mockReturnValue('/home/user/.zshrc');
    shellIntegration.getProfilePaths.mockReturnValue(['/home/user/.zshrc']);
    shellIntegration.getAvailableShells.mockReturnValue(['zsh']);
    shellIntegration.isInstalled.mockReturnValue(true);

    const status = await manager.getIntegrationStatus();

    expect(status).toEqual({
      installed: true,
      shell: 'zsh',
      profile: '/home/user/.zshrc',
      availableShells: ['zsh'],
    });
  });
});

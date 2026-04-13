/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { DependencyManager } from './DependencyManager.js';
import { type IProcessManager } from '../core/interfaces.js';
import fs from 'node:fs';

vi.mock('node:fs');
vi.mock('../core/Logger.js');

describe('DependencyManager', () => {
  let manager: DependencyManager;
  let processManager: Mocked<IProcessManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    processManager = {
      runSync: vi.fn(),
    } as any;
    manager = new DependencyManager(processManager);
  });

  it('should find pulumi in path', async () => {
    processManager.runSync.mockImplementation((bin: string) => {
      if (bin === 'which' || bin === 'where')
        return { status: 0, stdout: '/usr/bin/pulumi', stderr: '' };
      if (bin === 'pulumi') return { status: 0, stdout: '', stderr: '' };
      return { status: 1, stdout: '', stderr: '' };
    });

    const path = await manager.ensurePulumi();
    expect(path).toBe('/usr/bin/pulumi');
    expect(processManager.runSync).toHaveBeenCalledWith(
      expect.stringMatching(/which|where/),
      ['pulumi'],
      expect.any(Object),
    );
  });

  it('should trigger installation if not found', async () => {
    processManager.runSync.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: '',
    });
    (fs.existsSync as any).mockReturnValue(false);

    // Mock confirmInstallation to return false to avoid actual install loop
    vi.spyOn(manager as any, 'confirmInstallation').mockResolvedValue(false);

    await expect(manager.ensurePulumi()).rejects.toThrow(
      /required for this operation/,
    );
  });
});

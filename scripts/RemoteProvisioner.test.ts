/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteProvisioner } from './RemoteProvisioner.ts';

describe('RemoteProvisioner', () => {
  const mockProvider = {
    getContainerStatus: vi.fn(),
    removeContainer: vi.fn().mockResolvedValue(0),
    runContainer: vi.fn().mockResolvedValue(0),
    exec: vi.fn().mockResolvedValue(0),
    getExecOutput: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should provision a unique container for each PR session', async () => {
    mockProvider.getContainerStatus.mockResolvedValue({ running: false, exists: false });
    // first getExecOutput is for .git check
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 1 }); 
    // second is for main repo check
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 0 }); 
    // third is for setupCmd
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 0 }); 
    
    const provisioner = new RemoteProvisioner(mockProvider as any);
    await provisioner.provisionWorktree('23176', 'open', false, '');

    expect(mockProvider.runContainer).toHaveBeenCalledWith(
        expect.objectContaining({
            name: 'gcli-23176-open',
            mounts: expect.arrayContaining([
                expect.objectContaining({ container: '/mnt/disks/data/worktrees/workspace-23176-open' })
            ])
        })
    );

    // Verify git worktree repair is called (part of setupCmd)
    expect(mockProvider.getExecOutput).toHaveBeenCalledWith(
        expect.stringContaining('git -C /mnt/disks/data/worktrees/workspace-23176-open repair'),
        expect.objectContaining({ wrapContainer: 'gcli-23176-open' })
    );
  });
});

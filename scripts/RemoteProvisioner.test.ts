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
    vi.useFakeTimers();
    mockProvider.getContainerStatus.mockResolvedValue({ running: false, exists: false });
    
    // Sequence of calls:
    // 1. waitForContainer (polling echo 1)
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 0 }); 
    // 2. .git check
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 1 }); 
    // 3. cloneCmd
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 0 }); 
    
    const provisioner = new RemoteProvisioner(mockProvider as any);
    const provisionPromise = provisioner.provisionWorktree('23176', 'open', false, '');

    // Fast-forward the stability wait / polling
    await vi.runAllTimersAsync();
    await provisionPromise;

    expect(mockProvider.runContainer).toHaveBeenCalledWith(
        expect.objectContaining({
            name: 'gcli-23176-open',
            mounts: expect.arrayContaining([
                expect.objectContaining({ container: '/mnt/disks/data/worktrees/workspace-23176-open' })
            ])
        })
    );

    // Verify git clone with reference is called
    expect(mockProvider.getExecOutput).toHaveBeenCalledWith(
        expect.stringContaining('git clone --reference /mnt/disks/data/main'),
        expect.objectContaining({ wrapContainer: 'gcli-23176-open' })
    );

    // Verify gh pr checkout is called
    expect(mockProvider.getExecOutput).toHaveBeenCalledWith(
        expect.stringContaining('gh pr checkout 23176'),
        expect.objectContaining({ wrapContainer: 'gcli-23176-open' })
    );
  });
});

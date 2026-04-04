/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusManager } from './StatusManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { flattenCommand } from '../core/executors/types.js';

vi.mock('../providers/ProviderFactory.js');

describe('StatusManager', () => {
  const mockProjectCtx = { repoRoot: '/root', repoName: 'test-repo' };
  const mockInfra = {
    instanceName: 'test-station',
    providerType: 'local-worktree',
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('getPulse aggregates deep mission state from station worker', async () => {
    const mockProvider = {
      getStatus: vi
        .fn()
        .mockResolvedValue({ status: 'RUNNING', internalIp: '1.2.3.4' }),
      listCapsules: vi.fn().mockResolvedValue(['orbit-123-chat']),
      getCapsuleStats: vi.fn().mockResolvedValue({ cpu: '10%' }),
      getExecOutput: vi.fn().mockImplementation((cmd) => {
        const fullCmd = flattenCommand(cmd);
        if (fullCmd.includes('status')) {
          return {
            status: 0,
            stdout: JSON.stringify({
              missions: [
                {
                  mission: 'orbit-123-chat',
                  status: 'WAITING_FOR_INPUT',
                  last_question: 'How can I help?',
                },
              ],
            }),
          };
        }
        return { status: 1 };
      }),
      type: 'local-worktree',
    };

    (ProviderFactory.getProvider as any).mockReturnValue(mockProvider);

    const manager = new StatusManager(mockProjectCtx, mockInfra as any);
    const pulse = await manager.getPulse();

    expect(pulse.capsules).toHaveLength(1);
    expect(pulse.capsules[0]!.state).toBe('WAITING_FOR_INPUT');
    expect(pulse.capsules[0]!.lastQuestion).toBe('How can I help?');
    expect(mockProvider.getExecOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['status']),
      }),
      expect.any(Object),
    );
  });

  it('falls back to legacy discovery if aggregator fails', async () => {
    const mockProvider = {
      getStatus: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
      listCapsules: vi.fn().mockResolvedValue(['orbit-123-chat']),
      getCapsuleStats: vi.fn().mockResolvedValue({}),
      getExecOutput: vi.fn().mockImplementation((cmd) => {
        const fullCmd = flattenCommand(cmd);
        if (fullCmd.includes('status')) return { status: 1 }; // Aggregator fails
        if (fullCmd.includes('tmux list-sessions'))
          return { status: 0, stdout: 'default' };
        return { status: 1 };
      }),
      capturePane: vi.fn().mockResolvedValue('node@host:~$ '),
      type: 'local-worktree',
    };

    (ProviderFactory.getProvider as any).mockReturnValue(mockProvider);

    const manager = new StatusManager(mockProjectCtx, mockInfra as any);
    const pulse = await manager.getPulse();

    expect(pulse.capsules[0]!.state).toBe('WAITING'); // Legacy WAITING detection
  });
});

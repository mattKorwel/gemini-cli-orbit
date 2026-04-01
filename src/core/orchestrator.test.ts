/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOrchestrator } from './orchestrator.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { TempManager } from '../utils/TempManager.js';
import { SessionManager } from '../utils/SessionManager.js';

vi.mock('../providers/ProviderFactory.js');
vi.mock('../utils/TempManager.js');
vi.mock('../utils/SessionManager.js');
vi.mock('./Logger.js');

describe('Orchestrator', () => {
  const mockProvider = {
    type: 'gce',
    provision: vi.fn().mockResolvedValue(0),
    getStatus: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
    getCapsuleStatus: vi.fn().mockResolvedValue({ exists: true, running: true }),
    exec: vi.fn().mockResolvedValue(0),
    runCapsule: vi.fn().mockResolvedValue(0),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (ProviderFactory.getProvider as any).mockReturnValue(mockProvider);
    (TempManager.getToken as any).mockReturnValue('mock-token');
    (SessionManager.generateSessionId as any).mockReturnValue('mock-session');
    (SessionManager.generateMissionId as any).mockReturnValue('mock-mission');
  });

  it('should orchestrate a full mission lifecycle', async () => {
    const res = await runOrchestrator('23176', 'review');
    expect(res).toBe(0);
    expect(mockProvider.exec).toHaveBeenCalled();
  });

  it('should handle build failures gracefully', async () => {
    mockProvider.exec.mockResolvedValueOnce(0).mockResolvedValueOnce(1); // ls passes, build fails
    const res = await runOrchestrator('23176', 'review');
    expect(res).toBe(0); // Mission still completes
  });

  it('should inject GitHub token into RAM-disk context', async () => {
    let authCall: string[] | undefined;
    mockProvider.exec.mockImplementation(async (cmd: string, options: any) => {
      if (cmd.includes('git clone')) {
        authCall = [cmd, options.sensitiveEnv?.GITHUB_TOKEN];
      }
      return 0;
    });

    // Force worktree creation
    mockProvider.exec.mockResolvedValueOnce(1);

    await runOrchestrator('23176', 'review');

    expect(authCall).toBeDefined();
    if (authCall) {
      expect(authCall[1]).toBe('mock-token');
    }
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runStatus } from './status.ts';
import { ProviderFactory } from './providers/ProviderFactory.ts';
import fs from 'node:fs';

vi.mock('node:fs');
vi.mock('./providers/ProviderFactory.ts');

describe('runStatus', () => {
  const mockProvider = {
    getStatus: vi.fn().mockResolvedValue({ status: 'RUNNING', internalIp: '10.0.0.1' }),
    getExecOutput: vi.fn(),
    capturePane: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ProviderFactory, 'getProvider').mockReturnValue(mockProvider as any);
    
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      workspace: { projectId: 'p', zone: 'z' }
    }));
  });

  it('should detect THINKING vs WAITING states', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // 1. Find containers
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 0, stdout: 'gcli-1-open\ngcli-2-open', stderr: '' });
    
    // Container 1: Has tmux session, but Gemini is thinking (no prompt)
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 0, stdout: 'session', stderr: '' });
    mockProvider.capturePane.mockResolvedValueOnce('Some long agentic work happening...\nProcessing file...');
    
    // Container 2: Has tmux session, and Gemini is waiting (has prompt)
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 0, stdout: 'session', stderr: '' });
    mockProvider.capturePane.mockResolvedValueOnce('Work finished.\n > ');

    await runStatus();
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('🧠 [THINKING] gcli-1-open'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✋ [WAITING] gcli-2-open'));
  });
});

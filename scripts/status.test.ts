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
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ProviderFactory, 'getProvider').mockReturnValue(mockProvider as any);
    
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      workspace: { projectId: 'p', zone: 'z' }
    }));
  });

  it('should scan all gcli- containers and display their sessions', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // 1st call: find containers
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 0, stdout: 'gcli-123-open\ngcli-456-open', stderr: '' });
    // 2nd call: tmux sessions for 123
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 0, stdout: 'session-123', stderr: '' });
    // 3rd call: tmux sessions for 456
    mockProvider.getExecOutput.mockResolvedValueOnce({ status: 0, stdout: 'session-456', stderr: '' });

    await runStatus();
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅ [gcli-123-open] session-123'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅ [gcli-456-open] session-456'));
  });
});

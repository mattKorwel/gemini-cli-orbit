/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { IdentityTransport } from './IdentityTransport.js';

describe('IdentityTransport', () => {
  it('injects terminal color env into docker exec attach', async () => {
    const runSync = vi
      .fn()
      .mockReturnValue({ status: 0, stdout: '', stderr: '' });
    const transport = new IdentityTransport({
      run: vi.fn(),
      runAsync: vi.fn(),
      spawn: vi.fn(),
      runSync,
    } as any);

    const originalTerm = process.env.TERM;
    const originalColorTerm = process.env.COLORTERM;
    const originalForceColor = process.env.FORCE_COLOR;
    const originalTermProgram = process.env.TERM_PROGRAM;
    const originalTermProgramVersion = process.env.TERM_PROGRAM_VERSION;
    const originalWtSession = process.env.WT_SESSION;
    const originalTermSessionId = process.env.TERM_SESSION_ID;
    process.env.TERM = '';
    process.env.COLORTERM = '';
    process.env.FORCE_COLOR = '';
    process.env.TERM_PROGRAM = 'WindowsTerminal';
    process.env.TERM_PROGRAM_VERSION = '1.22.11141.0';
    process.env.WT_SESSION = 'wt-123';
    process.env.TERM_SESSION_ID = 'term-456';

    try {
      const status = await transport.attach('orbit-123', 'repo/123');
      expect(status).toBe(0);
      expect(runSync).toHaveBeenCalledWith(
        'docker',
        [
          'exec',
          '-it',
          '-e',
          'TERM=xterm-256color',
          '-e',
          'COLORTERM=truecolor',
          '-e',
          'FORCE_COLOR=3',
          '-e',
          'TERM_PROGRAM=WindowsTerminal',
          '-e',
          'TERM_PROGRAM_VERSION=1.22.11141.0',
          '-e',
          'WT_SESSION=wt-123',
          '-e',
          'TERM_SESSION_ID=term-456',
          'orbit-123',
          'tmux',
          'attach',
          '-t',
          'repo/123',
        ],
        expect.objectContaining({
          interactive: true,
          env: expect.objectContaining({
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            FORCE_COLOR: '3',
            TERM_PROGRAM: 'WindowsTerminal',
            TERM_PROGRAM_VERSION: '1.22.11141.0',
            WT_SESSION: 'wt-123',
            TERM_SESSION_ID: 'term-456',
          }),
        }),
      );
    } finally {
      if (originalTerm === undefined) delete process.env.TERM;
      else process.env.TERM = originalTerm;
      if (originalColorTerm === undefined) delete process.env.COLORTERM;
      else process.env.COLORTERM = originalColorTerm;
      if (originalForceColor === undefined) delete process.env.FORCE_COLOR;
      else process.env.FORCE_COLOR = originalForceColor;
      if (originalTermProgram === undefined) delete process.env.TERM_PROGRAM;
      else process.env.TERM_PROGRAM = originalTermProgram;
      if (originalTermProgramVersion === undefined)
        delete process.env.TERM_PROGRAM_VERSION;
      else process.env.TERM_PROGRAM_VERSION = originalTermProgramVersion;
      if (originalWtSession === undefined) delete process.env.WT_SESSION;
      else process.env.WT_SESSION = originalWtSession;
      if (originalTermSessionId === undefined)
        delete process.env.TERM_SESSION_ID;
      else process.env.TERM_SESSION_ID = originalTermSessionId;
    }
  });

  it('injects terminal color env into docker exec mission shell', async () => {
    const runSync = vi
      .fn()
      .mockReturnValue({ status: 0, stdout: '', stderr: '' });
    const transport = new IdentityTransport({
      run: vi.fn(),
      runAsync: vi.fn(),
      spawn: vi.fn(),
      runSync,
    } as any);

    const originalTerm = process.env.TERM;
    const originalColorTerm = process.env.COLORTERM;
    const originalForceColor = process.env.FORCE_COLOR;
    const originalTermProgram = process.env.TERM_PROGRAM;
    const originalTermProgramVersion = process.env.TERM_PROGRAM_VERSION;
    const originalWtSession = process.env.WT_SESSION;
    const originalTermSessionId = process.env.TERM_SESSION_ID;
    process.env.TERM = '';
    process.env.COLORTERM = '';
    process.env.FORCE_COLOR = '';
    process.env.TERM_PROGRAM = 'WindowsTerminal';
    process.env.TERM_PROGRAM_VERSION = '1.22.11141.0';
    process.env.WT_SESSION = 'wt-123';
    process.env.TERM_SESSION_ID = 'term-456';

    try {
      const status = await transport.missionShell(
        'orbit-123',
        '/orbit/workspaces/gemini-cli-orbit/take-two',
      );
      expect(status).toBe(0);
      expect(runSync).toHaveBeenCalledWith(
        'docker',
        [
          'exec',
          '-it',
          '-e',
          'TERM=xterm-256color',
          '-e',
          'COLORTERM=truecolor',
          '-e',
          'FORCE_COLOR=3',
          '-e',
          'TERM_PROGRAM=WindowsTerminal',
          '-e',
          'TERM_PROGRAM_VERSION=1.22.11141.0',
          '-e',
          'WT_SESSION=wt-123',
          '-e',
          'TERM_SESSION_ID=term-456',
          'orbit-123',
          '/bin/bash',
          '-lc',
          'cd "/orbit/workspaces/gemini-cli-orbit/take-two" && exec /bin/bash',
        ],
        expect.objectContaining({
          interactive: true,
          env: expect.objectContaining({
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            FORCE_COLOR: '3',
            TERM_PROGRAM: 'WindowsTerminal',
            TERM_PROGRAM_VERSION: '1.22.11141.0',
            WT_SESSION: 'wt-123',
            TERM_SESSION_ID: 'term-456',
          }),
        }),
      );
    } finally {
      if (originalTerm === undefined) delete process.env.TERM;
      else process.env.TERM = originalTerm;
      if (originalColorTerm === undefined) delete process.env.COLORTERM;
      else process.env.COLORTERM = originalColorTerm;
      if (originalForceColor === undefined) delete process.env.FORCE_COLOR;
      else process.env.FORCE_COLOR = originalForceColor;
      if (originalTermProgram === undefined) delete process.env.TERM_PROGRAM;
      else process.env.TERM_PROGRAM = originalTermProgram;
      if (originalTermProgramVersion === undefined)
        delete process.env.TERM_PROGRAM_VERSION;
      else process.env.TERM_PROGRAM_VERSION = originalTermProgramVersion;
      if (originalWtSession === undefined) delete process.env.WT_SESSION;
      else process.env.WT_SESSION = originalWtSession;
      if (originalTermSessionId === undefined)
        delete process.env.TERM_SESSION_ID;
      else process.env.TERM_SESSION_ID = originalTermSessionId;
    }
  });
});

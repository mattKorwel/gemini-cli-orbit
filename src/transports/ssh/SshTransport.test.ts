/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { SshTransport } from './SshTransport.js';

describe('SshTransport', () => {
  it('passes terminal identity env through remote attach', async () => {
    const ssh = {
      exec: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
      execAsync: vi.fn(),
      create: vi.fn(),
      copyTo: vi.fn(),
    };

    const transport = new SshTransport(
      'p1',
      'z1',
      'station-zeta',
      { sshUser: 'node' } as any,
      {} as any,
      ssh as any,
    );

    const originalTermProgram = process.env.TERM_PROGRAM;
    const originalTermProgramVersion = process.env.TERM_PROGRAM_VERSION;
    const originalWtSession = process.env.WT_SESSION;
    const originalTermSessionId = process.env.TERM_SESSION_ID;

    process.env.TERM_PROGRAM = 'WindowsTerminal';
    process.env.TERM_PROGRAM_VERSION = '1.22.11141.0';
    process.env.WT_SESSION = 'wt-123';
    process.env.TERM_SESSION_ID = 'term-456';

    try {
      const status = await transport.attach('orbit-123', 'repo/123');
      expect(status).toBe(0);
      expect(ssh.exec).toHaveBeenCalledWith(
        'node@nic0.station-zeta.z1.c.p1.internal',
        expect.stringContaining('-e TERM_PROGRAM=WindowsTerminal'),
        expect.objectContaining({
          interactive: true,
          env: expect.objectContaining({
            TERM_PROGRAM: 'WindowsTerminal',
            TERM_PROGRAM_VERSION: '1.22.11141.0',
            WT_SESSION: 'wt-123',
            TERM_SESSION_ID: 'term-456',
          }),
        }),
      );
    } finally {
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

  it('passes terminal identity env through remote mission shell', async () => {
    const ssh = {
      exec: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
      execAsync: vi.fn(),
      create: vi.fn(),
      copyTo: vi.fn(),
    };

    const transport = new SshTransport(
      'p1',
      'z1',
      'station-zeta',
      { sshUser: 'node' } as any,
      {} as any,
      ssh as any,
    );

    const originalTermProgram = process.env.TERM_PROGRAM;
    const originalTermProgramVersion = process.env.TERM_PROGRAM_VERSION;
    const originalWtSession = process.env.WT_SESSION;
    const originalTermSessionId = process.env.TERM_SESSION_ID;

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
      expect(ssh.exec).toHaveBeenCalledWith(
        'node@nic0.station-zeta.z1.c.p1.internal',
        expect.stringContaining('sudo docker exec -it'),
        expect.objectContaining({
          interactive: true,
          env: expect.objectContaining({
            TERM_PROGRAM: 'WindowsTerminal',
          }),
        }),
      );
      const call = vi.mocked(ssh.exec).mock.calls[0];
      expect(call?.[1]).toContain('-e TERM_PROGRAM=WindowsTerminal');
      expect(call?.[1]).toContain('orbit-123 bash -c');
    } finally {
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

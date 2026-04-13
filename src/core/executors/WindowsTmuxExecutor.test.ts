/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WindowsTmuxExecutor } from './WindowsTmuxExecutor.js';

describe('WindowsTmuxExecutor', () => {
  const mockPm: any = {
    runSync: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ORBIT_TMUX_BIN = 'tmux.exe';
  });

  it('normalizes session names (slashes to hyphens)', () => {
    const executor = new WindowsTmuxExecutor(mockPm);
    const cmd = executor.hasSession('repo/id/action');
    expect(cmd.args).toContain('repo-id-action');
  });

  it('wraps a mission correctly with PowerShell encoding and environment', () => {
    const executor = new WindowsTmuxExecutor(mockPm);
    const cmd = executor.wrapMission('mysession', 'node mission.js', {
      cwd: 'C:\\work',
      env: { MYVAR: 'myval' },
    });

    expect(cmd.bin).toBe('tmux.exe');
    expect(cmd.args).toContain('mysession');

    // The last argument is the PowerShell encoded command
    const lastArg = cmd.args[cmd.args.length - 1];
    expect(lastArg).toBeDefined();
    expect(lastArg).toContain('powershell.exe');
    expect(lastArg).toContain('-EncodedCommand');

    // Decode the base64 part to verify contents
    const base64 = lastArg?.split('-EncodedCommand ')[1];
    expect(base64).toBeDefined();
    const decoded = Buffer.from(base64!, 'base64').toString('utf16le');

    expect(decoded).toContain("& 'tmux.exe' set-option status on");
    expect(decoded).toContain("$env:COLORTERM='truecolor'");
    expect(decoded).toContain("$env:FORCE_COLOR='3'");
    expect(decoded).toContain("$env:MYVAR='myval'");
    expect(decoded).toContain("Set-Location 'C:\\work'");
    expect(decoded).toContain('node mission.js');
  });

  it('wraps an interactive chat session correctly', () => {
    const executor = new WindowsTmuxExecutor(mockPm);
    const cmd = executor.wrap('mysession', 'node chat.js', {
      detached: false,
      cwd: 'C:\\work',
    });

    expect(cmd.args).toContain('mysession');
    expect(cmd.args).not.toContain('-d'); // Detached should be false

    const lastArg = cmd.args[cmd.args.length - 1];
    expect(lastArg).toBeDefined();
    const base64 = lastArg?.split('-EncodedCommand ')[1];
    expect(base64).toBeDefined();
    const decoded = Buffer.from(base64!, 'base64').toString('utf16le');

    expect(decoded).toContain("& 'tmux.exe' set-option status on");
    expect(decoded).toContain("$env:FORCE_COLOR='3'");
    expect(decoded).toContain('🛰️  ORBIT');
    expect(decoded).toContain('node chat.js');
    expect(decoded).not.toContain(
      'powershell.exe -NoProfile -ExecutionPolicy Bypass',
    );
  });
});

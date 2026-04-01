/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunOrchestrator = vi.fn().mockResolvedValue(0);
const mockRunStatus = vi.fn().mockResolvedValue(0);
const mockRunJettison = vi.fn().mockResolvedValue(0);
const mockRunFleet = vi.fn().mockResolvedValue(0);

const mockExistsSync = vi.fn().mockReturnValue(true);
vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSync,
  },
  existsSync: mockExistsSync,
}));

vi.mock('./orchestrator.js', () => ({ runOrchestrator: mockRunOrchestrator }));
vi.mock('./status.js', () => ({ runStatus: mockRunStatus }));
vi.mock('./jettison.js', () => ({ runJettison: mockRunJettison }));
vi.mock('./fleet.js', () => ({ runFleet: mockRunFleet }));
vi.mock('./logs.js', () => ({ runLogs: vi.fn().mockResolvedValue(0) }));
vi.mock('./ci.js', () => ({ runCI: vi.fn().mockResolvedValue(0) }));
vi.mock('./reap.js', () => ({ runReap: vi.fn().mockResolvedValue(0) }));
vi.mock('./attach.js', () => ({ runAttach: vi.fn().mockResolvedValue(0) }));
vi.mock('./splashdown.js', () => ({
  runSplashdown: vi.fn().mockResolvedValue(0),
}));
vi.mock('./install-shell.js', () => ({
  runInstallShell: vi.fn().mockResolvedValue(0),
}));
vi.mock('./setup.js', () => ({ runSetup: vi.fn().mockResolvedValue(0) }));

describe('orbit-cli dispatch()', () => {
  let dispatch: (argv: string[]) => Promise<number>;
  let chdirSpy: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    chdirSpy = vi.spyOn(process, 'chdir').mockImplementation(() => {});

    delete process.env.GCLI_ORBIT_PROVIDER;
    delete process.env.GCLI_ORBIT_REPO_NAME;
    delete process.env.GCLI_ORBIT_INSTANCE_NAME;
    delete process.env.GCLI_ORBIT_SCHEMATIC;
    delete process.env.GCLI_MCP;
    delete process.env.GCLI_ORBIT_SHIM;

    // Re-import to pick up fresh mocks
    const mod = await import('./orbit-cli.js');
    dispatch = mod.dispatch;
  });

  it('returns 0 for empty argv', async () => {
    const code = await dispatch([]);
    expect(code).toBe(0);
  });

  it('returns 1 for unknown command', async () => {
    const code = await dispatch(['notacommand', 'something']);
    expect(code).toBe(1);
  });

  it('routes "mission <id>" to runOrchestrator', async () => {
    await dispatch(['mission', '42']);
    expect(mockRunOrchestrator).toHaveBeenCalledWith(['42']);
  });

  it('routes "pulse" to runStatus', async () => {
    await dispatch(['pulse', 'dummy']); // needs at least one arg to bypass help
    expect(mockRunStatus).toHaveBeenCalled();
  });

  it('routes "schematic list" to runFleet', async () => {
    await dispatch(['schematic', 'list']);
    expect(mockRunFleet).toHaveBeenCalledWith(['schematic', 'list']);
  });

  it('routes "station list" to runFleet', async () => {
    await dispatch(['station', 'list']);
    expect(mockRunFleet).toHaveBeenCalledWith(['station', 'list']);
  });

  it('routes "jettison <id>" to runJettison', async () => {
    await dispatch(['jettison', '21']);
    expect(mockRunJettison).toHaveBeenCalledWith(['21']);
  });

  it('--local flag sets GCLI_ORBIT_PROVIDER=local-worktree', async () => {
    await dispatch(['mission', '--local', '42']);
    expect(process.env.GCLI_ORBIT_PROVIDER).toBe('local-worktree');
    expect(process.env.GCLI_MCP).toBe('0');
    expect(mockRunOrchestrator).toHaveBeenCalledWith(['42']);
  });

  it('-l flag sets GCLI_ORBIT_PROVIDER=local-worktree', async () => {
    await dispatch(['mission', '-l', '42']);
    expect(process.env.GCLI_ORBIT_PROVIDER).toBe('local-worktree');
  });

  it('--repo flag sets GCLI_ORBIT_REPO_NAME', async () => {
    await dispatch(['mission', '--repo', 'my-repo', '42']);
    expect(process.env.GCLI_ORBIT_REPO_NAME).toBe('my-repo');
    expect(mockRunOrchestrator).toHaveBeenCalledWith(['42']);
  });

  it('repo:cmd shorthand sets GCLI_ORBIT_REPO_NAME and routes correctly', async () => {
    await dispatch(['dotfiles:mission', '42']);
    expect(process.env.GCLI_ORBIT_REPO_NAME).toBe('dotfiles');
    expect(mockRunOrchestrator).toHaveBeenCalledWith(['42']);
  });

  it('--repo-dir flag changes working directory', async () => {
    await dispatch(['mission', '--repo-dir=/tmp/foo', '42']);
    expect(chdirSpy).toHaveBeenCalledWith('/tmp/foo');
    expect(mockRunOrchestrator).toHaveBeenCalledWith(['42']);
  });

  it('--repo-dir flag with space changes working directory', async () => {
    await dispatch(['mission', '--repo-dir', '/tmp/bar', '42']);
    expect(chdirSpy).toHaveBeenCalledWith('/tmp/bar');
    expect(mockRunOrchestrator).toHaveBeenCalledWith(['42']);
  });

  it('--repo-dir flag returns 1 if directory missing', async () => {
    mockExistsSync.mockReturnValue(false);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const code = await dispatch(['mission', '--repo-dir=/missing', '42']);

    expect(code).toBe(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Repository directory not found'),
    );
    consoleSpy.mockRestore();
  });

  it('--for-station=<val> sets GCLI_ORBIT_INSTANCE_NAME', async () => {
    await dispatch(['mission', '--for-station=corp-vm', '42']);
    expect(process.env.GCLI_ORBIT_INSTANCE_NAME).toBe('corp-vm');
  });

  it('--for-station <val> (space form) sets GCLI_ORBIT_INSTANCE_NAME', async () => {
    await dispatch(['mission', '--for-station', 'corp-vm', '42']);
    expect(process.env.GCLI_ORBIT_INSTANCE_NAME).toBe('corp-vm');
    expect(mockRunOrchestrator).toHaveBeenCalledWith(['42']);
  });

  it('--schematic=<val> sets GCLI_ORBIT_SCHEMATIC', async () => {
    await dispatch(['station', 'liftoff', '--schematic=corp']);
    expect(process.env.GCLI_ORBIT_SCHEMATIC).toBe('corp');
  });

  it('--schematic <val> (space form) sets GCLI_ORBIT_SCHEMATIC', async () => {
    await dispatch(['station', 'liftoff', '--schematic', 'corp']);
    expect(process.env.GCLI_ORBIT_SCHEMATIC).toBe('corp');
  });

  it('--help on a known command returns 0 without calling runner', async () => {
    const code = await dispatch(['mission', '--help']);
    expect(code).toBe(0);
    expect(mockRunOrchestrator).not.toHaveBeenCalled();
  });

  it('-h on a known command returns 0 without calling runner', async () => {
    const code = await dispatch(['mission', '-h']);
    expect(code).toBe(0);
    expect(mockRunOrchestrator).not.toHaveBeenCalled();
  });

  it('sub-command help support: "orbit station liftoff --help" shows liftoff help', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await dispatch(['station', 'liftoff', '--help']);
    expect(code).toBe(0);
    // Should show "ORBIT COMMAND: LIFTOFF" instead of "STATION"
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('ORBIT COMMAND: LIFTOFF'),
    );
    consoleSpy.mockRestore();
  });

  it('command with no positional args after flag consumption returns 0 (shows help)', async () => {
    // e.g., `orbit mission --local` — --local is consumed, cleanArgs is empty
    const code = await dispatch(['mission', '--local']);
    expect(code).toBe(0);
    expect(mockRunOrchestrator).not.toHaveBeenCalled();
  });

  it('global --help returns 0', async () => {
    const code = await dispatch(['--help']);
    expect(code).toBe(0);
  });

  it('global -h returns 0', async () => {
    const code = await dispatch(['-h']);
    expect(code).toBe(0);
  });

  it('sets GCLI_ORBIT_SHIM=1 before calling runner', async () => {
    await dispatch(['mission', '42']);
    expect(process.env.GCLI_ORBIT_SHIM).toBe('1');
  });

  it('multiple global flags coexist: --local and --repo', async () => {
    await dispatch(['mission', '--local', '--repo', 'my-repo', '42']);
    expect(process.env.GCLI_ORBIT_PROVIDER).toBe('local-worktree');
    expect(process.env.GCLI_ORBIT_REPO_NAME).toBe('my-repo');
    expect(mockRunOrchestrator).toHaveBeenCalledWith(['42']);
  });

  it('propagates non-zero exit code from runner', async () => {
    mockRunOrchestrator.mockResolvedValueOnce(2);
    const code = await dispatch(['mission', '42']);
    expect(code).toBe(2);
  });

  it('returns 1 when runner throws', async () => {
    mockRunOrchestrator.mockRejectedValueOnce(new Error('boom'));
    const code = await dispatch(['mission', '42']);
    expect(code).toBe(1);
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStartMission = vi
  .fn()
  .mockResolvedValue({ exitCode: 0, missionId: 'test-mission' });
const mockGetPulse = vi.fn().mockResolvedValue({
  stationName: 'test-station',
  repoName: 'test-repo',
  status: 'RUNNING',
  capsules: [],
});
const mockListStations = vi.fn().mockResolvedValue([]);
const mockActivateStation = vi.fn().mockResolvedValue(undefined);
const mockDeleteStation = vi.fn().mockResolvedValue(undefined);
const mockHibernate = vi.fn().mockResolvedValue(undefined);
const mockListSchematics = vi.fn().mockReturnValue(['default']);
const mockImportSchematic = vi.fn().mockResolvedValue('new-schematic');
const mockSaveSchematic = vi.fn().mockResolvedValue(undefined);
const mockJettisonMission = vi
  .fn()
  .mockResolvedValue({ exitCode: 0, missionId: '42' });
const mockAttach = vi.fn().mockResolvedValue(0);
const mockMonitorCI = vi.fn().mockResolvedValue({ status: 'PASSED', runs: [] });
const mockProvisionStation = vi.fn().mockResolvedValue(0);
const mockGetLogs = vi.fn().mockResolvedValue(0);
const mockInstallShell = vi.fn().mockResolvedValue(undefined);
const mockReapMissions = vi.fn().mockResolvedValue(0);
const mockSplashdown = vi.fn().mockResolvedValue(0);

const mockExistsSync = vi.fn().mockReturnValue(true);
const mockCreateWriteStream = vi.fn().mockReturnValue({ write: vi.fn() });

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSync,
    createWriteStream: mockCreateWriteStream,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}'),
    readdirSync: vi.fn().mockReturnValue([]),
    realpathSync: vi.fn().mockImplementation((p) => p),
    appendFileSync: vi.fn(),
  },
  existsSync: mockExistsSync,
  createWriteStream: mockCreateWriteStream,
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('{}'),
  readdirSync: vi.fn().mockReturnValue([]),
  realpathSync: vi.fn().mockImplementation((p) => p),
  appendFileSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/home/user',
  },
  homedir: () => '/home/user',
}));

// Mock OrbitSDK
vi.mock('../sdk/OrbitSDK.js', () => ({
  OrbitSDK: vi.fn().mockImplementation(() => ({
    startMission: mockStartMission,
    getPulse: mockGetPulse,
    listStations: mockListStations,
    activateStation: mockActivateStation,
    hibernate: mockHibernate,
    deleteStation: mockDeleteStation,
    listSchematics: mockListSchematics,
    importSchematic: mockImportSchematic,
    saveSchematic: mockSaveSchematic,
    jettisonMission: mockJettisonMission,
    attach: mockAttach,
    monitorCI: mockMonitorCI,
    provisionStation: mockProvisionStation,
    getLogs: mockGetLogs,
    installShell: mockInstallShell,
    reapMissions: mockReapMissions,
    splashdown: mockSplashdown,
    observer: { onDivider: vi.fn() },
  })),
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  },
}));

// Mock ConfigManager to avoid "Cannot read properties of undefined"
vi.mock('../core/ConfigManager.js', () => ({
  getRepoConfig: vi.fn().mockReturnValue({ repoName: 'gemini-cli-orbit' }),
  detectRepoName: vi.fn().mockReturnValue('gemini-cli-orbit'),
  loadSettings: vi.fn().mockReturnValue({ repos: {} }),
  saveSettings: vi.fn(),
  saveSchematic: vi.fn(),
}));

// Mock other legacy modules
vi.mock('../core/fleet.js', () => ({ runFleet: vi.fn().mockResolvedValue(0) }));

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
    const mod = await import('./cli.js');
    dispatch = mod.dispatch;
  });

  it('returns 1 for empty argv (demands command)', async () => {
    const code = await dispatch([]);
    expect(code).toBe(1);
  });

  it('returns 1 for unknown command', async () => {
    const code = await dispatch(['notacommand', 'something']);
    expect(code).toBe(1);
  });

  it('routes "mission <id>" to OrbitSDK.startMission', async () => {
    await dispatch(['mission', '42']);
    expect(mockStartMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
  });

  it('routes "mission 42 uplink" to OrbitSDK.getLogs', async () => {
    await dispatch(['mission', '42', 'uplink']);
    expect(mockGetLogs).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
    });
  });

  it('routes "station pulse" to OrbitSDK.getPulse', async () => {
    await dispatch(['station', 'pulse']);
    expect(mockGetPulse).toHaveBeenCalled();
  });

  it('routes "infra schematic list" to OrbitSDK.listSchematics', async () => {
    await dispatch(['infra', 'schematic']);
    expect(mockListSchematics).toHaveBeenCalled();
  });

  it('routes "infra liftoff <name>" correctly', async () => {
    await dispatch(['infra', 'liftoff', 'my-station', '--schematic', 'custom']);
    expect(mockProvisionStation).toHaveBeenCalledWith({
      schematicName: 'custom',
      destroy: undefined,
    });
  });

  it('routes "station stop <name>" to OrbitSDK.hibernate', async () => {
    await dispatch(['station', 'stop', 'my-box']);
    expect(mockHibernate).toHaveBeenCalledWith({ name: 'my-box' });
  });

  it('routes "mission 42 jettison" to OrbitSDK.jettisonMission', async () => {
    await dispatch(['mission', '42', 'jettison']);
    expect(mockJettisonMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
    });
  });

  it('routes "mission 42 attach" to OrbitSDK.attach', async () => {
    await dispatch(['mission', '42', 'attach']);
    expect(mockAttach).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
    });
  });

  it('--local flag sets GCLI_ORBIT_PROVIDER=local-worktree', async () => {
    await dispatch(['mission', '--local', '42']);
    expect(process.env.GCLI_ORBIT_PROVIDER).toBe('local-worktree');
    expect(process.env.GCLI_MCP).toBe('0');
    expect(mockStartMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
  });

  it('-l flag sets GCLI_ORBIT_PROVIDER=local-worktree', async () => {
    await dispatch(['mission', '-l', '42']);
    expect(process.env.GCLI_ORBIT_PROVIDER).toBe('local-worktree');
    expect(mockStartMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
  });

  it('--repo flag sets GCLI_ORBIT_REPO_NAME', async () => {
    await dispatch(['mission', '--repo', 'my-repo', '42']);
    expect(process.env.GCLI_ORBIT_REPO_NAME).toBe('my-repo');
    expect(mockStartMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
  });

  it('repo:cmd shorthand sets GCLI_ORBIT_REPO_NAME and routes correctly', async () => {
    await dispatch(['dotfiles:mission', '42']);
    expect(process.env.GCLI_ORBIT_REPO_NAME).toBe('dotfiles');
    expect(mockStartMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
  });

  it('--repo-dir flag changes working directory', async () => {
    await dispatch(['mission', '--repo-dir=/tmp/foo', '42']);
    expect(chdirSpy).toHaveBeenCalledWith('/tmp/foo');
    expect(mockStartMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
  });

  it('--repo-dir flag with space changes working directory', async () => {
    await dispatch(['mission', '--repo-dir', '/tmp/bar', '42']);
    expect(chdirSpy).toHaveBeenCalledWith('/tmp/bar');
    expect(mockStartMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
  });

  it('--repo-dir flag expands tilde (~)', async () => {
    await dispatch(['mission', '--repo-dir=~/dev/foo', '42']);
    expect(chdirSpy).toHaveBeenCalledWith('/home/user/dev/foo');
    expect(mockStartMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
  });

  it('--repo-dir flag returns 1 if directory missing', async () => {
    mockExistsSync.mockReturnValue(false);
    const code = await dispatch(['mission', '--repo-dir=/missing', '42']);
    expect(code).toBe(1);
  });

  it('--for-station=<val> sets GCLI_ORBIT_INSTANCE_NAME', async () => {
    await dispatch(['mission', '--for-station=corp-vm', '42']);
    expect(process.env.GCLI_ORBIT_INSTANCE_NAME).toBe('corp-vm');
    expect(mockStartMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
  });

  it('--for-station <val> (space form) sets GCLI_ORBIT_INSTANCE_NAME', async () => {
    await dispatch(['mission', '--for-station', 'corp-vm', '42']);
    expect(process.env.GCLI_ORBIT_INSTANCE_NAME).toBe('corp-vm');
    expect(mockStartMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
  });

  it('--schematic=<val> sets GCLI_ORBIT_SCHEMATIC', async () => {
    await dispatch(['mission', '--schematic=custom', '42']);
    expect(process.env.GCLI_ORBIT_SCHEMATIC).toBe('custom');
    expect(mockStartMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
  });

  it('--schematic <val> (space form) sets GCLI_ORBIT_SCHEMATIC', async () => {
    await dispatch(['mission', '--schematic', 'custom', '42']);
    expect(process.env.GCLI_ORBIT_SCHEMATIC).toBe('custom');
    expect(mockStartMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
  });

  it('--help on a known command returns 0 without calling runner', async () => {
    const code = await dispatch(['mission', '--help']);
    expect(code).toBe(0);
    expect(mockStartMission).not.toHaveBeenCalled();
  });

  it('-h on a known command returns 0 without calling runner', async () => {
    const code = await dispatch(['mission', '-h']);
    expect(code).toBe(0);
    expect(mockStartMission).not.toHaveBeenCalled();
  });

  it('sub-command help support: "orbit station liftoff --help" shows liftoff help', async () => {
    const code = await dispatch(['station', 'liftoff', '--help']);
    expect(code).toBe(0);
  });

  it('command with no positional args after flag consumption returns 1 (error in yargs)', async () => {
    const code = await dispatch(['mission']);
    expect(code).toBe(1);
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
    expect(mockStartMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
  });

  it('propagates non-zero exit code from runner', async () => {
    mockStartMission.mockResolvedValueOnce({ exitCode: 2, missionId: 'test' });
    const code = await dispatch(['mission', '42']);
    expect(code).toBe(2);
  });

  it('returns 1 when runner throws', async () => {
    mockStartMission.mockRejectedValueOnce(new Error('boom'));
    const code = await dispatch(['mission', '42']);
    expect(code).toBe(1);
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStartMission = vi
  .fn()
  .mockResolvedValue({ exitCode: 0, missionId: 'test-mission' });
const mockResolveMission = vi.fn().mockResolvedValue({
  identifier: '42',
  repoName: 'gemini-cli-orbit',
  branchName: '42',
  action: 'chat',
  workDir: '/mock/work/dir',
  containerName: 'mock-container',
  sessionName: 'mock-session',
  policyPath: '/mock/policy',
  upstreamUrl: 'http://git.mock',
});
const mockGetPulse = vi.fn().mockResolvedValue({
  receipt: {
    name: 'test-station',
    repo: 'test-repo',
    type: 'local-worktree',
    rootPath: '/mock/path',
  },
  reality: { status: 'RUNNING', missions: [] },
});
const mockGetFleetState = vi.fn().mockResolvedValue([]);
const mockGetGlobalLocalPulse = vi.fn().mockResolvedValue([]);
const mockListStations = vi.fn().mockResolvedValue([]);
const mockActivateStation = vi.fn().mockResolvedValue(undefined);
const mockDeleteStation = vi.fn().mockResolvedValue(undefined);
const mockHibernate = vi.fn().mockResolvedValue(undefined);
const mockListSchematics = vi.fn().mockReturnValue([{ name: 'default' }]);
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
    platform: () => 'linux',
  },
  homedir: () => '/home/user',
  platform: () => 'linux',
}));

// Mock OrbitSDK
let lastSdkContext: any = null;
vi.mock('../sdk/OrbitSDK.js', () => ({
  OrbitSDK: vi.fn().mockImplementation((context) => {
    lastSdkContext = context;
    return {
      startMission: mockStartMission,
      resolveMission: mockResolveMission,
      getPulse: mockGetPulse,
      getFleetState: mockGetFleetState,
      getGlobalLocalPulse: mockGetGlobalLocalPulse,
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
      missionExec: vi.fn(),
      missionShell: vi.fn(),
      observer: { onDivider: vi.fn() },
    };
  }),
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  },
}));

// Mock ConfigManager
vi.mock('../core/ConfigManager.js', () => ({
  getRepoConfig: vi.fn().mockReturnValue({ repoName: 'gemini-cli-orbit' }),
  detectRepoName: vi.fn().mockReturnValue('gemini-cli-orbit'),
  loadSettings: vi.fn().mockReturnValue({ repos: {} }),
  loadProjectConfig: vi.fn().mockReturnValue({}),
  loadJson: vi.fn().mockReturnValue({}),
  saveSettings: vi.fn(),
  saveSchematic: vi.fn(),
  sanitizeName: vi.fn((n: string) =>
    n.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase(),
  ),
}));

// Mock ContextResolver to return a valid context immediately
vi.mock('../core/ContextResolver.js', () => ({
  ContextResolver: {
    resolve: vi.fn().mockImplementation(async ({ flags, env }) => ({
      project: {
        repoName: flags.repo || env?.GCLI_ORBIT_REPO_NAME || 'gemini-cli-orbit',
        repoRoot: '/mock/root',
      },
      infra: {
        providerType: flags.local ? 'local-worktree' : flags.providerType,
        instanceName: flags['for-station'] || flags.instanceName,
        schematic: flags.schematic,
      },
    })),
    validate: vi.fn(),
  },
}));

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
    delete process.env.GCLI_ORBIT_AUTO_APPROVE;

    // Re-import to pick up fresh mocks
    const mod = await import('./cli.js');
    dispatch = mod.dispatch;
  });

  it('returns 1 for empty argv (shows error)', async () => {
    const code = await dispatch([]);
    expect(code).toBe(1);
  });

  it('returns 1 for unknown command (shows error)', async () => {
    const code = await dispatch(['notacommand', 'something']);
    expect(code).toBe(1);
  });

  it('routes "mission start <id>" to OrbitSDK.startMission', async () => {
    await dispatch(['mission', 'start', '42']);
    expect(mockResolveMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
    expect(mockStartMission).toHaveBeenCalled();
  });

  it('routes "mission uplink <id>" to OrbitSDK.getLogs', async () => {
    await dispatch(['mission', 'uplink', '42']);
    expect(mockGetLogs).toHaveBeenCalledWith({
      identifier: '42',
      action: undefined,
    });
  });

  it('routes "constellation" to OrbitSDK.getFleetState', async () => {
    await dispatch(['constellation']);
    expect(mockGetFleetState).toHaveBeenCalledWith(
      expect.objectContaining({
        includeMissions: false,
      }),
    );
  });

  it('routes "constellation --pulse" to OrbitSDK.getFleetState with missions', async () => {
    await dispatch(['constellation', '--pulse']);
    expect(mockGetFleetState).toHaveBeenCalledWith(
      expect.objectContaining({
        includeMissions: true,
      }),
    );
  });

  it('routes "constellation --all" to OrbitSDK.getFleetState without repo filter', async () => {
    process.env.GCLI_ORBIT_REPO_NAME = 'test-repo';
    await dispatch(['constellation', '--all']);
    expect(mockGetFleetState).toHaveBeenCalledWith(
      expect.objectContaining({
        repoFilter: undefined,
      }),
    );
  });

  it('renders constellation output with context info', async () => {
    mockGetFleetState.mockResolvedValueOnce([
      {
        receipt: {
          name: 'local-box',
          repo: 'orbit',
          type: 'local-worktree',
          rootPath: '/dev/orbit',
        },
        reality: { status: 'RUNNING', missions: [] },
        isActive: true,
      },
      {
        receipt: {
          name: 'remote-box',
          repo: 'orbit',
          type: 'gce',
          projectId: 'p1',
        },
        reality: { status: 'RUNNING', missions: [] },
        isActive: false,
      },
    ]);

    const spy = vi.spyOn(console, 'log');
    await dispatch(['constellation', '--pulse']);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('LOCAL STATION: local-box'),
    );
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('(/dev/orbit)'));
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('REMOTE STATION: remote-box'),
    );
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[p1]'));
  });

  it('routes "ls" alias to constellation', async () => {
    await dispatch(['ls']);
    expect(mockGetFleetState).toHaveBeenCalled();
  });

  it('routes "infra schematic list" to OrbitSDK.listSchematics', async () => {
    await dispatch(['infra', 'schematic', 'list']);
    expect(mockListSchematics).toHaveBeenCalled();
  });

  it('routes "infra liftoff <name>" correctly', async () => {
    await dispatch(['infra', 'liftoff', 'my-station', '--schematic', 'custom']);
    expect(mockProvisionStation).toHaveBeenCalledWith({
      stationName: 'my-station',
      schematicName: 'custom',
      destroy: undefined,
    });
  });

  it('sets global auto-approve env when -y is provided', async () => {
    await dispatch(['infra', 'liftoff', 'my-station', '-y']);

    expect(process.env.GCLI_ORBIT_AUTO_APPROVE).toBe('1');
  });

  it('routes "station hibernate <name>" to OrbitSDK.hibernate', async () => {
    await dispatch(['station', 'hibernate', 'my-box']);
    expect(mockHibernate).toHaveBeenCalledWith({ name: 'my-box' });
  });

  it('routes "mission jettison <id>" to OrbitSDK.jettisonMission', async () => {
    await dispatch(['mission', 'jettison', '42']);
    expect(mockJettisonMission).toHaveBeenCalledWith({
      identifier: '42',
    });
  });

  it('routes "mission attach <id>" to OrbitSDK.attach', async () => {
    await dispatch(['mission', 'attach', '42']);
    expect(mockAttach).toHaveBeenCalledWith({
      identifier: '42',
    });
  });

  it('routes "mission peek <id>" to OrbitSDK.getFleetState with peek:true', async () => {
    mockGetFleetState.mockResolvedValueOnce([
      {
        receipt: { name: 's1', type: 'local-worktree', repo: 'r1' },
        reality: {
          status: 'RUNNING',
          missions: [{ name: 'm1', state: 'WAITING', lastThought: 'Hello' }],
        },
      },
    ]);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await dispatch(['mission', 'peek', 'm1']);

    expect(mockGetFleetState).toHaveBeenCalledWith(
      expect.objectContaining({
        missionFilter: '*m1*',
        includeMissions: true,
        peek: true,
      }),
    );
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Thought: Hello'));
  });

  it('--local flag sets providerType=local-worktree', async () => {
    await dispatch(['mission', 'start', '--local', '42']);
    expect(lastSdkContext.infra.providerType).toBe('local-worktree');
    expect(mockResolveMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
    expect(mockStartMission).toHaveBeenCalled();
  });

  it('-l flag sets providerType=local-worktree', async () => {
    await dispatch(['mission', 'start', '-l', '42']);
    expect(lastSdkContext.infra.providerType).toBe('local-worktree');
    expect(mockResolveMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
    expect(mockStartMission).toHaveBeenCalled();
  });

  it('--repo flag sets project.repoName', async () => {
    await dispatch(['mission', 'start', '--repo', 'my-repo', '42']);
    expect(lastSdkContext.project.repoName).toBe('my-repo');
    expect(mockResolveMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
    expect(mockStartMission).toHaveBeenCalled();
  });

  it('repo:cmd shorthand sets project.repoName and routes correctly', async () => {
    // Shorthand with explicit command
    await dispatch(['dotfiles:mission', 'start', '42']);
    expect(lastSdkContext.project.repoName).toBe('dotfiles');
    expect(mockResolveMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
    expect(mockStartMission).toHaveBeenCalled();
  });

  it('--repo-dir flag changes working directory', async () => {
    await dispatch(['mission', 'start', '--repo-dir=/tmp/foo', '42']);
    expect(chdirSpy).toHaveBeenCalledWith(
      expect.stringMatching(/[\\\/]tmp[\\\/]foo/),
    );
    expect(mockResolveMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
    expect(mockStartMission).toHaveBeenCalled();
  });

  it('--repo-dir flag with space changes working directory', async () => {
    await dispatch(['mission', 'start', '--repo-dir', '/tmp/bar', '42']);
    expect(chdirSpy).toHaveBeenCalledWith(
      expect.stringMatching(/[\\\/]tmp[\\\/]bar/),
    );
    expect(mockResolveMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
    expect(mockStartMission).toHaveBeenCalled();
  });

  it('--repo-dir flag expands tilde (~)', async () => {
    await dispatch(['mission', 'start', '--repo-dir=~/dev/foo', '42']);
    expect(chdirSpy).toHaveBeenCalledWith(
      expect.stringMatching(/[\\\/]home[\\\/]user[\\\/]dev[\\\/]foo/),
    );
    expect(mockResolveMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
    expect(mockStartMission).toHaveBeenCalled();
  });

  it('--repo-dir flag returns 1 if directory missing', async () => {
    mockExistsSync.mockReturnValue(false);
    const code = await dispatch([
      'mission',
      'start',
      '--repo-dir=/missing',
      '42',
    ]);
    expect(code).toBe(1);
  });

  it('--for-station=<val> sets context.infra.instanceName', async () => {
    await dispatch(['mission', 'start', '--for-station=corp-vm', '42']);
    expect(lastSdkContext.infra.instanceName).toBe('corp-vm');
    expect(mockResolveMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
    expect(mockStartMission).toHaveBeenCalled();
  });

  it('--for-station <val> (space form) sets context.infra.instanceName', async () => {
    await dispatch(['mission', 'start', '--for-station', 'corp-vm', '42']);
    expect(lastSdkContext.infra.instanceName).toBe('corp-vm');
    expect(mockResolveMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
    expect(mockStartMission).toHaveBeenCalled();
  });

  it('--schematic=<val> sets context.infra.schematic', async () => {
    await dispatch(['mission', 'start', '--schematic=custom', '42']);
    expect(lastSdkContext.infra.schematic).toBe('custom');
    expect(mockResolveMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
    expect(mockStartMission).toHaveBeenCalled();
  });

  it('--schematic <val> (space form) sets context.infra.schematic', async () => {
    await dispatch(['mission', 'start', '--schematic', 'custom', '42']);
    expect(lastSdkContext.infra.schematic).toBe('custom');
    expect(mockResolveMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
    expect(mockStartMission).toHaveBeenCalled();
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

  it('sub-command help support: "orbit station list --help" shows help', async () => {
    const code = await dispatch(['station', 'list', '--help']);
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

  it('multiple global flags coexist: --local and --repo', async () => {
    await dispatch(['mission', 'start', '--local', '--repo', 'my-repo', '42']);
    expect(lastSdkContext.infra.providerType).toBe('local-worktree');
    expect(lastSdkContext.project.repoName).toBe('my-repo');
    expect(mockResolveMission).toHaveBeenCalledWith({
      identifier: '42',
      action: 'chat',
      args: [],
    });
    expect(mockStartMission).toHaveBeenCalled();
  });

  it('propagates non-zero exit code from runner', async () => {
    mockStartMission.mockResolvedValueOnce({ exitCode: 2, missionId: 'test' });
    const code = await dispatch(['mission', 'start', '42']);
    expect(code).toBe(2);
  });

  it('returns 1 when runner throws', async () => {
    mockStartMission.mockRejectedValueOnce(new Error('boom'));
    const code = await dispatch(['mission', 'start', '42']);
    expect(code).toBe(1);
  });
});

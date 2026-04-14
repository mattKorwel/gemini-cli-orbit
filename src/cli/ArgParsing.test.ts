/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatch } from './cli.js';

// Mock the SDK to capture calls
const mockProvisionStation = vi.fn().mockResolvedValue(0);
const mockStartMission = vi.fn().mockResolvedValue({ exitCode: 0 });
const mockResolveMission = vi.fn().mockResolvedValue({
  identifier: 'mock-id',
  repoName: 'mock-repo',
  branchName: 'mock-branch',
  action: 'chat',
  workDir: '/mock/work',
  containerName: 'mock-container',
  sessionName: 'mock-session',
  policyPath: '/mock/policy',
  upstreamUrl: 'http://git.mock',
});
const mockMissionExec = vi.fn().mockResolvedValue(0);
const mockAttach = vi.fn().mockResolvedValue(0);
const mockJettisonMission = vi.fn().mockResolvedValue({ exitCode: 0 });
const mockSplashdown = vi.fn().mockResolvedValue(0);
const mockHibernate = vi.fn().mockResolvedValue(undefined);
const mockGetFleetState = vi.fn().mockResolvedValue([]);

const mockGetLogs = vi.fn().mockResolvedValue(0);
const mockMissionShell = vi.fn().mockResolvedValue(0);
const mockActivateStation = vi.fn().mockResolvedValue(undefined);
const mockStationShell = vi.fn().mockResolvedValue(0);
const mockStationExec = vi.fn().mockResolvedValue(0);
const mockReapMissions = vi.fn().mockResolvedValue(undefined);
const mockListSchematics = vi.fn().mockReturnValue([]);
const mockGetSchematic = vi.fn().mockReturnValue(null);
const mockImportSchematic = vi.fn().mockResolvedValue('imported-schematic');
const mockRunSchematicWizard = vi.fn().mockResolvedValue(undefined);
const mockInstallShell = vi.fn().mockResolvedValue(undefined);

vi.mock('../sdk/OrbitSDK.js', () => ({
  OrbitSDK: vi.fn().mockImplementation(() => ({
    provisionStation: mockProvisionStation,
    startMission: mockStartMission,
    resolveMission: mockResolveMission,
    missionExec: mockMissionExec,
    missionShell: mockMissionShell,
    attach: mockAttach,
    getLogs: mockGetLogs,
    jettisonMission: mockJettisonMission,
    splashdown: mockSplashdown,
    hibernate: mockHibernate,
    activateStation: mockActivateStation,
    stationShell: mockStationShell,
    stationExec: mockStationExec,
    reapMissions: mockReapMissions,
    listSchematics: mockListSchematics,
    getSchematic: mockGetSchematic,
    importSchematic: mockImportSchematic,
    runSchematicWizard: mockRunSchematicWizard,
    installShell: mockInstallShell,
    getFleetState: mockGetFleetState,
  })),
}));

// Mock ContextResolver to avoid filesystem hits
vi.mock('../core/ContextResolver.js', () => ({
  ContextResolver: {
    resolve: vi.fn().mockResolvedValue({
      project: { repoName: 'test-repo', repoRoot: '/tmp' },
      infra: { instanceName: 'locked-context-name' },
    }),
    validate: vi.fn(),
  },
}));

describe('CLI Argument Parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GCLI_ORBIT_AUTO_APPROVE;
  });

  describe('Infra Commands', () => {
    it('should pass the provided station name to sdk.provisionStation', async () => {
      await dispatch(['infra', 'liftoff', 'my-new-station']);

      expect(mockProvisionStation).toHaveBeenCalledWith(
        expect.objectContaining({
          stationName: 'my-new-station',
        }),
      );
    });

    it('should pass schematic and destroy flags', async () => {
      await dispatch([
        'infra',
        'liftoff',
        '--schematic',
        'fast-box',
        '--destroy',
      ]);

      expect(mockProvisionStation).toHaveBeenCalledWith(
        expect.objectContaining({
          schematicName: 'fast-box',
          destroy: true,
        }),
      );
    });

    it('should set auto-approve env when liftoff is run with -y', async () => {
      await dispatch(['infra', 'liftoff', 'my-new-station', '-y']);

      expect(process.env.GCLI_ORBIT_AUTO_APPROVE).toBe('1');
      expect(mockProvisionStation).toHaveBeenCalledWith(
        expect.objectContaining({
          stationName: 'my-new-station',
        }),
      );
    });

    describe('Schematic Commands', () => {
      it('should handle schematic list', async () => {
        await dispatch(['infra', 'schematic', 'list']);
        expect(mockListSchematics).toHaveBeenCalled();
      });

      it('should handle schematic show', async () => {
        await dispatch(['infra', 'schematic', 'show', 'my-schematic']);
        expect(mockGetSchematic).toHaveBeenCalledWith('my-schematic');
      });

      it('should handle schematic view (alias for show)', async () => {
        await dispatch(['infra', 'schematic', 'view', 'my-schematic']);
        expect(mockGetSchematic).toHaveBeenCalledWith('my-schematic');
      });

      it('should handle schematic import', async () => {
        await dispatch(['infra', 'schematic', 'import', 'http://some-url']);
        expect(mockImportSchematic).toHaveBeenCalledWith('http://some-url');
      });

      it('should handle schematic create', async () => {
        await dispatch(['infra', 'schematic', 'create', 'new-schematic']);
        expect(mockRunSchematicWizard).toHaveBeenCalledWith(
          'new-schematic',
          expect.anything(),
        );
      });

      it('should handle schematic edit with headless flags', async () => {
        await dispatch([
          'infra',
          'schematic',
          'edit',
          'existing-schematic',
          '--projectId',
          'new-project',
          '--zone',
          'us-east1-c',
        ]);
        expect(mockRunSchematicWizard).toHaveBeenCalledWith(
          'existing-schematic',
          expect.objectContaining({
            projectId: 'new-project',
            zone: 'us-east1-c',
          }),
        );
      });
    });
  });

  describe('Mission Commands', () => {
    it('should map mission start positionals correctly', async () => {
      await dispatch(['mission', 'start', '123', 'review', 'extra-arg']);

      expect(mockResolveMission).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '123',
          action: 'review',
          args: ['extra-arg'],
        }),
      );
    });

    it('should pass dev flag to sdk.resolveMission', async () => {
      await dispatch(['mission', 'start', '123', '--dev']);

      expect(mockResolveMission).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '123',
          dev: true,
        }),
      );
    });

    it('should pass auth flags to sdk.resolveMission', async () => {
      await dispatch([
        'mission',
        'start',
        '123',
        '--git-auth',
        'repo-token',
        '--gemini-auth',
        'none',
      ]);

      expect(mockResolveMission).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '123',
          gitAuthMode: 'repo-token',
          geminiAuthMode: 'none',
        }),
      );
    });

    it('should handle terminal target flags', async () => {
      // Test --background
      await dispatch(['mission', 'start', '123', '--background']);
      expect(mockResolveMission).toHaveBeenLastCalledWith(
        expect.objectContaining({
          identifier: '123',
          terminalTarget: 'background',
        }),
      );

      // Test --new-window
      await dispatch(['mission', 'start', '456', '--new-window']);
      expect(mockResolveMission).toHaveBeenLastCalledWith(
        expect.objectContaining({
          identifier: '456',
          terminalTarget: 'new-window',
        }),
      );

      // Test --new-tab
      await dispatch(['mission', 'start', '789', '--new-tab']);
      expect(mockResolveMission).toHaveBeenLastCalledWith(
        expect.objectContaining({
          identifier: '789',
          terminalTarget: 'new-tab',
        }),
      );

      // Test --target foreground
      await dispatch(['mission', 'start', 'abc', '--target', 'foreground']);
      expect(mockResolveMission).toHaveBeenLastCalledWith(
        expect.objectContaining({
          identifier: 'abc',
          terminalTarget: 'foreground',
        }),
      );
    });

    it('should handle "mission launch" alias identically to start', async () => {
      await dispatch(['mission', 'launch', '789', 'implement']);

      expect(mockResolveMission).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '789',
          action: 'implement',
        }),
      );
    });

    it('should handle "mission uplink" with action', async () => {
      await dispatch(['mission', 'uplink', '101', 'chat']);

      expect(mockGetLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '101',
          action: 'chat',
        }),
      );
    });

    it('should handle "mission exec" with correct arguments', async () => {
      await dispatch(['mission', 'exec', '456', 'ls -la']);

      expect(mockMissionExec).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '456',
          command: 'ls -la',
        }),
      );
    });

    it('should handle "mission shell"', async () => {
      await dispatch(['mission', 'shell', '456']);

      expect(mockMissionShell).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '456',
        }),
      );
    });

    it('should handle "mission attach" with action', async () => {
      await dispatch(['mission', 'attach', '789', 'fix']);

      expect(mockAttach).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '789',
          action: 'fix',
        }),
      );
    });

    it('should handle "mission jettison" with action', async () => {
      await dispatch(['mission', 'jettison', '101', 'review']);

      expect(mockJettisonMission).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '101',
          action: 'review',
        }),
      );
    });

    it('should handle top-level "jettison" alias', async () => {
      await dispatch(['jettison', '202', 'fix']);

      expect(mockJettisonMission).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '202',
          action: 'fix',
        }),
      );
    });

    it('should handle top-level "delete" alias', async () => {
      await dispatch(['delete', '303']);

      expect(mockJettisonMission).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '303',
        }),
      );
    });

    it('should handle "mission peek" with action', async () => {
      await dispatch(['mission', 'peek', '123', 'fix']);

      expect(mockGetFleetState).toHaveBeenCalledWith(
        expect.objectContaining({
          missionFilter: '*123*',
          includeMissions: true,
          peek: true,
          all: true,
        }),
      );
    });
  });

  describe('Constellation Command', () => {
    it('should pass peek flag to getFleetState', async () => {
      await dispatch(['constellation', '--pulse', '--peek']);

      expect(mockGetFleetState).toHaveBeenCalledWith(
        expect.objectContaining({
          includeMissions: true,
          peek: true,
        }),
      );
    });

    it('should pass filter flags to getFleetState', async () => {
      await dispatch([
        'constellation',
        '--all',
        '--current',
        '--select-by-name',
        'my-station*',
      ]);

      expect(mockGetFleetState).toHaveBeenCalledWith(
        expect.objectContaining({
          all: true,
          repoFilter: 'test-repo',
          nameFilter: 'my-station*',
        }),
      );
    });

    it('should handle infra splashdown', async () => {
      await dispatch(['infra', 'splashdown', 'old-box', '--force', '--all']);

      expect(mockSplashdown).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'old-box',
          force: true,
          all: true,
        }),
      );
    });

    it('should set auto-approve env for infra splashdown with -y', async () => {
      await dispatch(['infra', 'splashdown', 'old-box', '-y']);

      expect(process.env.GCLI_ORBIT_AUTO_APPROVE).toBe('1');
      expect(mockSplashdown).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'old-box',
        }),
      );
    });
  });

  describe('Station Commands', () => {
    it('should handle station activate', async () => {
      await dispatch(['station', 'activate', 'my-box']);
      expect(mockActivateStation).toHaveBeenCalledWith('my-box');
    });

    it('should handle station hibernate', async () => {
      await dispatch(['station', 'hibernate', 'my-box']);

      expect(mockHibernate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'my-box',
        }),
      );
    });

    it('should handle station shell', async () => {
      await dispatch(['station', 'shell', 'my-box']);
      expect(mockStationShell).toHaveBeenCalled();
    });

    it('should handle station exec', async () => {
      await dispatch(['station', 'exec', 'ls', '--', '-la']);
      expect(mockStationExec).toHaveBeenCalledWith('ls', ['-la']);
    });

    it('should handle station reap', async () => {
      await dispatch(['station', 'reap', '--threshold', '24', '--force']);
      expect(mockReapMissions).toHaveBeenCalledWith({
        threshold: 24,
        force: true,
      });
    });

    it('should handle station delete', async () => {
      await dispatch(['station', 'delete', 'dead-box']);

      expect(mockSplashdown).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'dead-box',
        }),
      );
    });
  });

  describe('Config Commands', () => {
    it('should handle config install', async () => {
      await dispatch(['config', 'install']);
      expect(mockInstallShell).toHaveBeenCalled();
    });

    it('should handle config show', async () => {
      await dispatch(['config', 'show']);
      // Just verifying it doesn't crash as it mainly prints to console
    });
  });
});


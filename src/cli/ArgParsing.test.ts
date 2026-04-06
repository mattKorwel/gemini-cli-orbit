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
const mockDeleteStation = vi.fn().mockResolvedValue(undefined);
const mockGetFleetState = vi.fn().mockResolvedValue([]);

vi.mock('../sdk/OrbitSDK.js', () => ({
  OrbitSDK: vi.fn().mockImplementation(() => ({
    provisionStation: mockProvisionStation,
    startMission: mockStartMission,
    resolveMission: mockResolveMission,
    missionExec: mockMissionExec,
    attach: mockAttach,
    jettisonMission: mockJettisonMission,
    splashdown: mockSplashdown,
    hibernate: mockHibernate,
    deleteStation: mockDeleteStation,
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

    it('should handle "mission exec" with correct arguments', async () => {
      await dispatch(['mission', 'exec', '456', 'ls -la']);

      expect(mockMissionExec).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: '456',
          command: 'ls -la',
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
  });

  describe('Station Commands', () => {
    it('should handle station hibernate', async () => {
      await dispatch(['station', 'hibernate', 'my-box']);

      expect(mockHibernate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'my-box',
        }),
      );
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
});

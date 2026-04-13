/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { StarfleetProvider } from './StarfleetProvider.js';

class TestGceStarfleetProvider extends StarfleetProvider {
  readonly type = 'gce' as const;
  override async verifyIgnition() {
    return true;
  }
}

class TestLocalDockerStarfleetProvider extends StarfleetProvider {
  readonly type = 'local-docker' as const;
  override async verifyIgnition() {
    return true;
  }
}

describe('StarfleetProvider.missionShell', () => {
  it('delegates mission shell to the transport for GCE', async () => {
    const missionShell = vi.fn().mockResolvedValue(0);
    const provider = new TestGceStarfleetProvider(
      {
        ping: vi.fn().mockResolvedValue(true),
        setBaseUrl: vi.fn(),
      } as any,
      {
        missionShell,
        getConnectionHandle: vi
          .fn()
          .mockReturnValue('matt_korwel_gmail_com@35.188.152.246'),
        exec: vi.fn(),
        attach: vi.fn(),
        ensureTunnel: vi.fn(),
        sync: vi.fn(),
        setOverrideHost: vi.fn(),
        getMagicRemote: vi.fn(),
      } as any,
      {} as any,
      {} as any,
      { repoRoot: '/repo', repoName: 'gemini-cli-orbit' } as any,
      { networkAccessType: 'external' } as any,
      { projectId: 'p', zone: 'z', stationName: 'starfleet-main' },
    );

    const status = await provider.missionShell(
      'orbit-mission-main-123',
      '/orbit/workspaces/gemini-cli-orbit/mission-main',
    );

    expect(status).toBe(0);
    expect(missionShell).toHaveBeenCalledWith(
      'orbit-mission-main-123',
      '/orbit/workspaces/gemini-cli-orbit/mission-main',
      undefined,
    );
  });

  it('delegates mission shell to the transport for local-docker', async () => {
    const missionShell = vi.fn().mockResolvedValue(0);
    const provider = new TestLocalDockerStarfleetProvider(
      {
        ping: vi.fn().mockResolvedValue(true),
        setBaseUrl: vi.fn(),
      } as any,
      {
        missionShell,
        getConnectionHandle: vi.fn().mockReturnValue('local'),
        exec: vi.fn(),
        attach: vi.fn(),
        ensureTunnel: vi.fn(),
        sync: vi.fn(),
        setOverrideHost: vi.fn(),
        getMagicRemote: vi.fn(),
      } as any,
      {} as any,
      {} as any,
      { repoRoot: '/repo', repoName: 'gemini-cli-orbit' } as any,
      { providerType: 'local-docker' } as any,
      { projectId: 'local', zone: 'localhost', stationName: 'local-docker' },
    );

    const status = await provider.missionShell(
      'orbit-local-123',
      '/orbit/workspaces/gemini-cli-orbit/local-123',
    );

    expect(status).toBe(0);
    expect(missionShell).toHaveBeenCalledWith(
      'orbit-local-123',
      '/orbit/workspaces/gemini-cli-orbit/local-123',
      undefined,
    );
  });
});

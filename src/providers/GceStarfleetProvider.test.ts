/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { GceStarfleetProvider } from './GceStarfleetProvider.js';

describe('GceStarfleetProvider.verifyIgnition', () => {
  it('fails fast when docker inspect fails but docker ps shows a restarting supervisor', async () => {
    const exec = vi.fn(async (command: any) => {
      const bin = command.bin;
      const args = command.args || [];
      const joined = `${bin} ${args.join(' ')}`;

      if (joined === 'echo pong') {
        return { status: 0, stdout: 'pong', stderr: '' };
      }
      if (joined === 'df -h /mnt/disks/data') {
        return { status: 0, stdout: '/mnt/disks/data', stderr: '' };
      }
      if (joined === 'ls -d /mnt/disks/data') {
        return { status: 0, stdout: '/mnt/disks/data', stderr: '' };
      }
      if (joined === 'sudo docker version') {
        return { status: 0, stdout: 'Docker version', stderr: '' };
      }
      if (bin === 'sh' && args[0] === '-lc') {
        return { status: 0, stdout: 'refreshed', stderr: '' };
      }
      if (
        joined.includes(
          'sudo docker ps -a --filter name=^/station-supervisor$ --format {{.Status}}',
        )
      ) {
        return {
          status: 0,
          stdout: 'Restarting (1) 5 seconds ago',
          stderr: '',
        };
      }
      if (
        joined.includes(
          'sudo docker inspect --format {{.State.Status}}|{{.State.Restarting}}|{{.RestartCount}} station-supervisor',
        )
      ) {
        return { status: 1, stdout: '', stderr: 'inspect failed' };
      }
      if (joined.includes('sudo docker logs --tail 80 station-supervisor')) {
        return { status: 0, stdout: '', stderr: 'boom from supervisor' };
      }

      return { status: 1, stdout: '', stderr: `unexpected: ${joined}` };
    });

    const provider = new GceStarfleetProvider(
      {
        ping: vi.fn().mockResolvedValue(false),
        setBaseUrl: vi.fn(),
      } as any,
      {
        exec,
        ensureTunnel: vi.fn(),
        getConnectionHandle: vi
          .fn()
          .mockReturnValue('matt_korwel_gmail_com@35.188.152.246'),
        setOverrideHost: vi.fn(),
      } as any,
      {} as any,
      {} as any,
      { repoRoot: '/repo', repoName: 'gemini-cli-orbit' } as any,
      { networkAccessType: 'external' } as any,
      {
        projectId: 'ai-01-492020',
        zone: 'us-central1-a',
        stationName: 'starfleet-main',
      },
    );

    const observer = {
      onLog: vi.fn(),
    } as any;

    const ok = await provider.verifyIgnition(observer);

    expect(ok).toBe(false);
    expect(observer.onLog).toHaveBeenCalledWith(
      expect.anything(),
      'SETUP',
      expect.stringContaining('crash-looping'),
    );
    expect(observer.onLog).toHaveBeenCalledWith(
      expect.anything(),
      'SETUP',
      expect.stringContaining('Restarting (1) 5 seconds ago'),
    );
  });
});

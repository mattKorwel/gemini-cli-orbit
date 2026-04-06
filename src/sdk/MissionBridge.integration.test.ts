/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MissionManager } from './MissionManager.js';
import { LocalWorktreeProvider } from '../providers/LocalWorktreeProvider.js';
import { NodeExecutor } from '../core/executors/NodeExecutor.js';
import { type MissionManifest } from '../core/types.js';
import { main as stationMain } from '../station/station.js';
import { main as missionMain } from '../station/capsule/mission.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Mission Bridge Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should execute end-to-end from SDK to final Gemini command via double-bridge simulation', async () => {
    // This test ensures that the SDK -> Provider -> Station -> Mission -> Gemini flow
    // is consistent and that the manifest is correctly preserved through the entire pipeline.

    const recordedCommands: { bin: string; args: string[]; env: any }[] = [];
    const executionPromises: Promise<any>[] = [];

    // The "System" PM represents the hardware.
    const systemPm: any = {
      runSync: vi.fn().mockImplementation((bin, args, options) => {
        // Record all "external" commands
        recordedCommands.push({ bin, args, env: options?.env || {} });

        // DOCTOR CHECK MOCK: If mission.js checks git health, return success
        if (args.includes('--is-inside-work-tree')) {
          return { status: 0, stdout: 'true', stderr: '' };
        }

        // BRIDGE 1: SDK -> Station (Host Setup)
        if (
          bin.includes('node') &&
          args.some((a: string) => a.includes('station.js')) &&
          args.includes('start')
        ) {
          const manifestJson = options?.env?.GCLI_ORBIT_MANIFEST;

          executionPromises.push(
            (async () => {
              const originalEnv = process.env.GCLI_ORBIT_MANIFEST;
              process.env.GCLI_ORBIT_MANIFEST = manifestJson;
              try {
                // Call the REAL station main with our systemPm
                return await stationMain(['start'], systemPm);
              } finally {
                if (originalEnv) process.env.GCLI_ORBIT_MANIFEST = originalEnv;
                else delete process.env.GCLI_ORBIT_MANIFEST;
              }
            })(),
          );

          return { status: 0, stdout: 'Station Triggered', stderr: '' };
        }

        // BRIDGE 2: Station -> Mission (Session Bootstrap)
        if (bin === 'tmux' && args.includes('new-session')) {
          // Tmux command contains the manifest in its environment (via ITmuxExecutor)
          // In our integration test, we extract it from the environment we stubbed in Bridge 1
          const manifestJson = process.env.GCLI_ORBIT_MANIFEST;

          executionPromises.push(
            (async () => {
              const originalEnv = process.env.GCLI_ORBIT_MANIFEST;
              process.env.GCLI_ORBIT_MANIFEST = manifestJson;
              try {
                // Call the REAL mission main (agent satellite)
                return await missionMain(systemPm);
              } finally {
                if (originalEnv) process.env.GCLI_ORBIT_MANIFEST = originalEnv;
                else delete process.env.GCLI_ORBIT_MANIFEST;
              }
            })(),
          );

          return { status: 0, stdout: 'Tmux Triggered', stderr: '' };
        }

        return { status: 0, stdout: '', stderr: '' };
      }),
      runAsync: vi.fn(),
      spawn: vi.fn().mockImplementation(() => ({
        stdout: { pipe: vi.fn() },
        stderr: { pipe: vi.fn() },
        on: vi.fn(),
      })),
    };

    const projectCtx = { repoName: 'real-repo', repoRoot: tempDir };
    const executors: any = {
      node: new NodeExecutor(systemPm),
      git: {},
      docker: {},
      tmux: new (
        await import('../core/executors/TmuxExecutor.js')
      ).TmuxExecutor(systemPm),
    };

    const provider = new LocalWorktreeProvider(
      projectCtx as any,
      systemPm,
      executors,
      'real-station',
      path.join(tempDir, 'real-workspaces'),
    );

    const manager = new MissionManager(
      projectCtx as any,
      { projectId: 'local' } as any,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
      { getProvider: () => provider } as any,
      {
        loadSettings: () => ({ repos: {} }),
        detectRemoteUrl: () => 'http://git.real',
        loadSchematic: () => ({}),
        saveSettings: vi.fn(),
      } as any,
      executors,
      { saveReceipt: vi.fn() } as any,
    );

    // STEP 1: Launch mission from the SDK
    await manager.start({ identifier: 'PR-888', action: 'chat' });

    // STEP 2: Wait for all handovers to finish
    await Promise.all(executionPromises);

    // Give a tiny bit of time for all commands to be recorded from the promises
    await new Promise((r) => setTimeout(r, 100));

    // STEP 3: VERIFY the entire cascading chain of commands.

    // A. SDK provisioning commands (using sanitized ID)
    const provisioning = recordedCommands.find(
      (c) => c.args.includes('worktree') && c.args.includes('add'),
    );
    expect(provisioning).toBeDefined();
    expect(provisioning?.args).toContain('pr-888');

    // B. Station Manager commands (Git Setup)
    const gitInit = recordedCommands.find((c) => c.args.includes('init'));
    expect(gitInit).toBeDefined();

    // C. Mission Agent commands (Doctor Checks)
    const gitDoctor = recordedCommands.find((c) =>
      c.args.includes('--is-inside-work-tree'),
    );
    expect(gitDoctor).toBeDefined();

    // D. FINAL EXECUTION: Did Gemini actually get called with the right settings?
    const geminiCall = recordedCommands.find((c) => c.bin === 'gemini');
    expect(geminiCall).toBeDefined();
    expect(geminiCall?.env.GCLI_ORBIT_MISSION_ID).toBe('PR-888');
    expect(geminiCall?.env.GCLI_ORBIT_ACTION).toBe('chat');
  });

  it('should fail if the station is started without a manifest', async () => {
    const mockPm: any = {
      runSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
    };

    // Explicitly clear env
    const originalEnv = process.env.GCLI_ORBIT_MANIFEST;
    delete process.env.GCLI_ORBIT_MANIFEST;

    try {
      // This should return 1 because getManifestFromEnv() fails and is caught
      const code = await stationMain(['start'], mockPm);
      expect(code).toBe(1);
    } finally {
      if (originalEnv) process.env.GCLI_ORBIT_MANIFEST = originalEnv;
    }
  });
});

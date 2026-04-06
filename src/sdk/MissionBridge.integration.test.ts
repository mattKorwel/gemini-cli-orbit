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
import { main as workerMain } from '../station/worker.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Mission Bridge Integration', () => {
  let missionManager: MissionManager;
  let mockPm: any;
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-'));

    mockPm = {
      runSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
      runAsync: vi.fn(),
      spawn: vi.fn(),
    };

    const mockExecutors: any = {
      node: new NodeExecutor(mockPm),
      git: {},
      docker: {},
      tmux: {
        attach: vi.fn().mockReturnValue({ status: 0 }),
      },
    };

    const projectCtx = {
      repoName: 'test-repo',
      repoRoot: tempDir,
    };

    const infra = {
      projectId: 'local',
      providerType: 'local-worktree',
    };

    const provider = new LocalWorktreeProvider(
      projectCtx as any,
      mockPm,
      mockExecutors,
      'test-station',
      path.join(tempDir, 'workspaces'),
    );

    const providerFactory: any = {
      getProvider: () => provider,
    };

    const configManager: any = {
      loadSettings: () => ({ repos: {} }),
      detectRemoteUrl: () => 'https://github.com/org/repo.git',
      loadSchematic: () => ({}),
    };

    const stationRegistry: any = {
      saveReceipt: vi.fn(),
    };

    missionManager = new MissionManager(
      projectCtx as any,
      infra as any,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
      providerFactory,
      configManager,
      mockExecutors,
      stationRegistry,
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should pass GCLI_ORBIT_MANIFEST to the worker in LocalWorktreeProvider', async () => {
    // 1. Trigger mission start
    await missionManager.start({ identifier: '123', action: 'chat' });

    // 2. Capture the call to pm.runSync that starts the worker
    // We expect multiple calls (git, etc.), so find the one for 'station.js'
    const workerCall = mockPm.runSync.mock.calls.find(
      (call: any) =>
        call[0].includes('node') &&
        call[1].some((arg: string) => arg.includes('station.js')),
    );

    expect(workerCall).toBeDefined();
    const options = workerCall[2];
    expect(options.env).toBeDefined();
    expect(options.env.GCLI_ORBIT_MANIFEST).toBeDefined();

    const manifest: MissionManifest = JSON.parse(
      options.env.GCLI_ORBIT_MANIFEST,
    );
    expect(manifest.identifier).toBe('123');
    expect(manifest.action).toBe('chat');
  });

  it('should preserve manifest when merging with empty command options', async () => {
    const projectCtx = { repoRoot: tempDir, repoName: 'test' };
    const mockExecutors: any = {
      node: new NodeExecutor(mockPm),
      git: {},
      docker: {},
      tmux: { attach: vi.fn().mockReturnValue({ status: 0 }) },
    };
    const provider = new LocalWorktreeProvider(
      projectCtx as any,
      mockPm,
      mockExecutors,
      'test',
      path.join(tempDir, 'ws'),
    );

    const manifest = { identifier: '456' } as any;
    const startCmd = provider.createNodeCommand('script.js', ['start']);

    // Manual call to getExecOutput to simulate MissionManager flow
    await provider.getMissionExecOutput(
      startCmd,
      { workspaceName: 'ws1' } as any,
      { manifest },
    );

    const workerCall = mockPm.runSync.mock.calls.find((call: any) =>
      call[1].some((arg: string) => arg.includes('script.js')),
    );
    expect(workerCall).toBeDefined();
    expect(workerCall[2].env.GCLI_ORBIT_MANIFEST).toBeDefined();
    expect(JSON.parse(workerCall[2].env.GCLI_ORBIT_MANIFEST).identifier).toBe(
      '456',
    );
  });

  it('should execute the full orchestration flow correctly', async () => {
    // This test ensures that the SDK -> Manager -> Provider -> Executor flow preserves the manifest
    const projectCtx = { repoName: 'full-flow-repo', repoRoot: tempDir };
    const infra = { projectId: 'local', providerType: 'local-worktree' };

    // 1. Create dependencies
    const executors: any = {
      node: new NodeExecutor(mockPm),
      git: {},
      docker: {},
      tmux: { attach: vi.fn().mockReturnValue({ status: 0 }) },
    };

    const provider = new LocalWorktreeProvider(
      projectCtx as any,
      mockPm,
      executors,
      'full-station',
      path.join(tempDir, 'full-workspaces'),
    );

    const providerFactory: any = {
      getProvider: () => provider,
    };

    const configManager: any = {
      loadSettings: () => ({ repos: {} }),
      detectRemoteUrl: () => 'https://github.com/full/repo.git',
      loadSchematic: () => ({}),
      saveSettings: vi.fn(),
    };

    const stationRegistry: any = {
      saveReceipt: vi.fn(),
    };

    const manager = new MissionManager(
      projectCtx as any,
      infra as any,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
      providerFactory,
      configManager,
      executors,
      stationRegistry,
    );

    // 2. Start mission
    await manager.start({ identifier: 'PR-999', action: 'chat' });

    // 3. Verify final process execution
    const startCall = mockPm.runSync.mock.calls.find(
      (call: any) =>
        call[1].some((arg: string) => arg.includes('station.js')) &&
        call[1].includes('start'),
    );

    expect(startCall).toBeDefined();
    const env = startCall[2].env;
    expect(env.GCLI_ORBIT_MANIFEST).toBeDefined();

    const manifest: MissionManifest = JSON.parse(env.GCLI_ORBIT_MANIFEST);
    expect(manifest.identifier).toBe('PR-999');
    expect(manifest.repoName).toBe('full-flow-repo');
    expect(manifest.action).toBe('chat');
    expect(manifest.workDir).toContain('full-workspaces');
    expect(manifest.workDir).toContain('pr-999');
  });

  it('should execute end-to-end from SDK to final station commands via automatic pass-through bridge', async () => {
    // This test uses a single "system" PM that automatically bridges SDK calls to Worker logic.
    const systemCommands: string[] = [];
    const workerPromises: Promise<any>[] = [];

    const systemPm: any = {
      runSync: vi.fn().mockImplementation((bin, args, options) => {
        const fullCmd = `${bin} ${args.join(' ')}`;
        systemCommands.push(fullCmd);

        // AUTOMATIC BRIDGE:
        // If the SDK (or anyone) tries to start the worker, we intercept and run the logic in-process.
        if (
          bin.includes('node') &&
          args.some((a: string) => a.includes('station.js')) &&
          args.includes('start')
        ) {
          const manifestJson = options?.env?.GCLI_ORBIT_MANIFEST;
          if (manifestJson) {
            // Bridge: Stub the environment and trigger the worker logic using the SAME systemPm.
            vi.stubEnv('GCLI_ORBIT_MANIFEST', manifestJson);
            workerPromises.push(workerMain(['start'], systemPm));
          }
          return { status: 0, stdout: 'Worker triggered', stderr: '' };
        }

        return { status: 0, stdout: '', stderr: '' };
      }),
      runAsync: vi.fn(),
      spawn: vi.fn(),
    };

    const projectCtx = { repoName: 'auto-repo', repoRoot: tempDir };
    const executors: any = {
      node: new NodeExecutor(systemPm),
      git: {},
      docker: {},
      tmux: { attach: vi.fn().mockReturnValue({ status: 0 }) },
    };

    const provider = new LocalWorktreeProvider(
      projectCtx as any,
      systemPm,
      executors,
      'auto-station',
      path.join(tempDir, 'auto-workspaces'),
    );

    const manager = new MissionManager(
      projectCtx as any,
      { projectId: 'local' } as any,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
      { getProvider: () => provider } as any,
      {
        loadSettings: () => ({ repos: {} }),
        detectRemoteUrl: () => 'http://git.local',
        loadSchematic: () => ({}),
        saveSettings: vi.fn(),
      } as any,
      executors,
      { saveReceipt: vi.fn() } as any,
    );

    // STEP 1: SDK triggers the mission.
    // The systemPm.runSync will catch the worker spawn and trigger workerMain automatically.
    await manager.start({ identifier: 'PR-123', action: 'chat' });

    // STEP 2: Wait for any triggered worker logic to complete.
    await Promise.all(workerPromises);

    // STEP 3: VERIFY the entire cascading chain of commands.

    // A. SDK provisioning commands (using full paths resolved in LocalWorktreeProvider)
    const worktreeAdd = systemCommands.find((c) => c.includes('worktree add'));
    expect(worktreeAdd).toBeDefined();
    expect(worktreeAdd).toContain('pr-123');

    // B. Worker initialization commands (triggered via the automatic bridge)
    expect(systemCommands).toContain('git init');
    expect(systemCommands).toContain('git rev-parse --verify pr-123');

    // C. Final Tmux launch (the end of the line for a chat mission)
    const tmuxCall = systemCommands.find((c) => c.includes('tmux new-session'));
    expect(tmuxCall).toBeDefined();
    expect(tmuxCall).toContain('GCLI_ORBIT_MANIFEST=');
    expect(tmuxCall).toContain('pr-123');
  });
});

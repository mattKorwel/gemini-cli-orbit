/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MissionManager } from './MissionManager.js';
import { LocalWorktreeProvider } from '../providers/LocalWorktreeProvider.js';
import { GceCosProvider } from '../providers/GceCosProvider.js';
import { GceSSHManager } from '../providers/SSHManager.js';
import { NodeExecutor } from '../core/executors/NodeExecutor.js';
import { DockerExecutor } from '../core/executors/DockerExecutor.js';
import { GitExecutor } from '../core/executors/GitExecutor.js';
import { TmuxExecutor } from '../core/executors/TmuxExecutor.js';
import { ContextResolver } from '../core/ContextResolver.js';
import { main as stationMain } from '../station/station.js';
import { main as missionMain } from '../station/capsule/mission.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const { createdDirs } = vi.hoisted(() => ({
  createdDirs: new Set<string>(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const mockReadFileSync = vi
    .fn()
    .mockReturnValue(JSON.stringify({ repos: {} }));
  const mockExistsSync = vi.fn().mockImplementation((p) => {
    if (createdDirs.has(p)) return true;
    if (p.includes('orbit-git-worktrees') || p.includes('real-repo'))
      return false;
    return true;
  });
  const mockMkdirSync = vi.fn().mockImplementation((p) => {
    createdDirs.add(p);
  });
  const mockWriteFileSync = vi.fn();
  const mockReaddirSync = vi.fn().mockReturnValue([]);
  const mockStatSync = vi.fn().mockReturnValue({
    isDirectory: () => true,
    isFile: () => false,
    size: 0,
  });

  return {
    ...actual,
    readFileSync: mockReadFileSync,
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
    default: {
      ...actual,
      readFileSync: mockReadFileSync,
      existsSync: mockExistsSync,
      mkdirSync: mockMkdirSync,
      writeFileSync: mockWriteFileSync,
      readdirSync: mockReaddirSync,
      statSync: mockStatSync,
    },
  };
});

describe('Mission Bridge Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    createdDirs.clear();
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

    // --- INITIALIZE SDK WITH DETERMINISTIC CONTEXT ---
    const context = await ContextResolver.resolve({
      repoRoot: tempDir,
      flags: { repoName: 'real-repo' },
      env: {},
    });

    const executors: any = {
      node: new NodeExecutor(systemPm),
      git: new GitExecutor(systemPm),
      docker: new DockerExecutor(systemPm),
      tmux: new TmuxExecutor(systemPm),
      ssh: { exec: vi.fn(), rsync: vi.fn() },
    };

    const provider = new LocalWorktreeProvider(
      context.project,
      systemPm,
      executors,
      'real-station',
      path.join(tempDir, 'real-workspaces'),
    );

    const manager = new MissionManager(
      context.project,
      context.infra,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
      { getProvider: () => provider } as any,
      {
        loadSettings: () => ({ repos: {} }),
        detectRemoteUrl: () => 'http://git.real',
        loadSchematic: () => ({}),
        saveSettings: vi.fn(),
        loadJson: vi.fn(),
        saveSchematic: vi.fn(),
      } as any,
      systemPm,
      executors,
      { saveReceipt: vi.fn() } as any,
    );

    // STEP 1: Launch mission from the SDK
    const manifest = await manager.resolve({
      identifier: 'PR-888',
      action: 'chat',
    });
    await manager.start(manifest);

    // STEP 2: Wait for all handovers to finish (including cascading ones)
    while (executionPromises.length > 0) {
      await Promise.all([...executionPromises]);
      executionPromises.splice(0, executionPromises.length);
      // Give a tiny bit of time for new promises to be pushed if any
      await new Promise((r) => setTimeout(r, 50));
    }

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

  it('should execute end-to-end GCE mission via Triple-Bridge (SDK -> SSH -> Station -> Docker -> Mission)', async () => {
    // This is the most complex integration test.
    // It simulates cross-machine and cross-container boundaries.

    const recordedCommands: {
      host: string;
      bin: string;
      args: string[];
      env: any;
    }[] = [];
    const executionPromises: Promise<any>[] = [];
    const stationName = 'corp-remote-v1';
    const projectId = 'corp-project-99';
    const zone = 'us-west1-a';
    const expectedHostname = `nic0.${stationName}.${zone}.c.${projectId}.internal.gcpnode.com`;

    // --- SETUP: VIRTUAL FILESYSTEM ---
    const norm = (p: string) => p.replace(/\\/g, '/');
    (fs.readFileSync as any).mockImplementation((p: string) => {
      const n = norm(p);
      if (n.includes(`${stationName}.json`))
        return JSON.stringify({
          name: stationName,
          type: 'gce',
          projectId,
          zone,
          dnsSuffix: 'internal.gcpnode.com',
          userSuffix: '_google_com',
        });
      // Default to empty valid settings
      return JSON.stringify({ repos: {} });
    });

    // --- THE MAGIC SYSTEM PM: CAPTURES & BRIDGES ---
    let lastManifest: any = null;
    const systemPm: any = {
      runSync: vi.fn().mockImplementation((bin, args, options) => {
        const fullArgs = args.join(' ');

        // Capture manifest if present in options
        if (options?.env?.GCLI_ORBIT_MANIFEST) {
          lastManifest = JSON.parse(options.env.GCLI_ORBIT_MANIFEST);
        }

        // 1. CAPTURE: Local SSH calls
        if (bin === 'ssh') {
          recordedCommands.push({
            host: 'local',
            bin,
            args,
            env: options?.env,
          });

          // BRIDGE A: Local -> Remote (SSH to Station/Capsule)
          if (fullArgs.includes('station.js start')) {
            const manifestForRemote = lastManifest;
            executionPromises.push(
              (async () => {
                const originalEnv = process.env.GCLI_ORBIT_MANIFEST;
                if (manifestForRemote)
                  process.env.GCLI_ORBIT_MANIFEST =
                    JSON.stringify(manifestForRemote);
                try {
                  // SIMULATION: We are now on the "Remote Host/Capsule"
                  return await stationMain(['start'], systemPm);
                } finally {
                  process.env.GCLI_ORBIT_MANIFEST = originalEnv;
                }
              })(),
            );
            return { status: 0, stdout: 'SSH: Station Started' };
          }

          // MOCK: Docker check on remote
          if (fullArgs.includes('docker inspect')) {
            return { status: 0, stdout: 'true' };
          }

          return { status: 0, stdout: '' };
        }

        // 2. CAPTURE: Remote commands (simulated via stationMain)
        if (bin === 'tmux' && args.includes('new-session')) {
          recordedCommands.push({
            host: 'remote',
            bin,
            args,
            env: options?.env,
          });
          executionPromises.push(
            (async () => {
              // SIMULATION: We are now "Inside the Capsule" (Mission Agent)
              return await missionMain(systemPm);
            })(),
          );
          return { status: 0, stdout: 'Tmux: Mission Started' };
        }

        // 3. CAPTURE: Final Gemini call inside capsule
        if (bin === 'gemini') {
          recordedCommands.push({
            host: 'capsule',
            bin,
            args,
            env: options?.env,
          });
        }

        // DOCTOR CHECK MOCK
        if (args.includes('--is-inside-work-tree')) {
          return { status: 0, stdout: 'true' };
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

    // --- INITIALIZE SDK WITH DETERMINISTIC CONTEXT ---
    const context = await ContextResolver.resolve({
      repoRoot: tempDir,
      flags: { forStation: stationName, repoName: 'real-repo' },
      env: { USER: 'bob' },
    });

    const executors: any = {
      node: new NodeExecutor(systemPm),
      git: new GitExecutor(systemPm),
      docker: new DockerExecutor(systemPm),
      tmux: new TmuxExecutor(systemPm),
      ssh: {
        exec: vi
          .fn()
          .mockImplementation((target, command, options) =>
            systemPm.runSync('ssh', [target, command], options),
          ),
        rsync: vi
          .fn()
          .mockImplementation((local, remote, options) =>
            systemPm.runSync('rsync', [local, remote], options),
          ),
      },
    };

    const providerFactory = {
      getProvider: (p: any, i: any) =>
        new GceCosProvider(
          p,
          i.projectId,
          i.zone,
          i.instanceName,
          p.repoRoot,
          new GceSSHManager(
            i.projectId,
            i.zone,
            i.instanceName,
            i,
            systemPm,
            executors.ssh,
          ),
          systemPm,
          executors,
          i,
          {},
        ),
    };

    const manager = new MissionManager(
      context.project,
      context.infra,
      { onLog: vi.fn(), onProgress: vi.fn() } as any,
      providerFactory as any,
      {
        loadSettings: () => ({ repos: {} }),
        saveSettings: vi.fn(),
        detectRemoteUrl: () => 'http://git.real',
        loadJson: vi.fn(),
        saveSchematic: vi.fn(),
      } as any,
      systemPm,
      executors,
      { saveReceipt: vi.fn() } as any,
    );

    // --- ACT: START THE TRIPLE BRIDGE ---
    const manifest = await manager.resolve({
      identifier: 'BRIDGE-TEST-1',
      action: 'chat',
    });
    await manager.start(manifest);

    // Wait for all cascading promises
    while (executionPromises.length > 0) {
      await Promise.all([...executionPromises]);
      executionPromises.splice(0, executionPromises.length);
      await new Promise((r) => setTimeout(r, 50));
    }

    // --- ASSERT: VERIFY THE CHAIN ---

    // 1. Local SSH call used the correct magic hostname
    const sshToStation = recordedCommands.find(
      (c) =>
        c.host === 'local' &&
        c.bin === 'ssh' &&
        c.args.join(' ').includes(expectedHostname),
    );
    expect(sshToStation).toBeDefined();
    expect(sshToStation?.args.join(' ')).toContain(
      `bob_google_com@${expectedHostname}`,
    );

    // 2. Station Manager executed on "Remote" and called Tmux (in GCE it's direct via station.js)
    const tmuxRun = recordedCommands.find(
      (c) => c.host === 'remote' && c.bin === 'tmux',
    );
    expect(tmuxRun).toBeDefined();
    expect(tmuxRun?.args.join(' ')).toContain('real-repo/bridge-test-1');

    // 3. Final command reached Gemini inside the "Capsule"
    const geminiFinal = recordedCommands.find(
      (c) => c.host === 'capsule' && c.bin === 'gemini',
    );
    expect(geminiFinal).toBeDefined();
    expect(geminiFinal?.env.GCLI_ORBIT_MISSION_ID).toBe('BRIDGE-TEST-1');
  });
});

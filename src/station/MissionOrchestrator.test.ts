/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StarfleetHarness } from '../test/StarfleetHarness.js';
import { MissionOrchestrator } from './MissionOrchestrator.js';
import { WorkspaceManager } from './WorkspaceManager.js';
import { DockerManager } from './DockerManager.js';
import { GitExecutor } from '../core/executors/GitExecutor.js';
import { DockerExecutor } from '../core/executors/DockerExecutor.js';
import path from 'node:path';
import fs from 'node:fs';

describe('MissionOrchestrator (Behavioral)', () => {
  let harness: StarfleetHarness;
  let orchestrator: MissionOrchestrator;

  beforeEach(() => {
    harness = new StarfleetHarness('MissionOrchestrator');
    harness.stub('git', '');
    harness.stub('docker', '');

    const pm = harness.createProcessManager();
    const git = new GitExecutor(pm);
    const dockerExec = new DockerExecutor(pm, 'docker');

    const config: any = {
      port: 8080,
      workerImage: 'test-worker-image',
      manifestRoot: harness.root,
      isUnlocked: true,
      useSudo: false,
      storage: {
        workspacesRoot: harness.resolve('workspaces'),
        mirrorPath: harness.resolve('mirror'),
      },
      mounts: [{ host: harness.root, capsule: '/orbit' }],
      areas: {
        homeRoot: {
          host: harness.resolve('home'),
          capsule: '/orbit/home',
          kind: 'dir',
        },
        globalGemini: {
          host: harness.resolve('home/.gemini'),
          capsule: '/orbit/home/.gemini',
          kind: 'dir',
        },
      },
      bundlePath: '/usr/local/lib/orbit/bundle',
    };

    const workspace = new WorkspaceManager(git, config);
    const docker = new DockerManager(dockerExec, pm, config);
    orchestrator = new MissionOrchestrator(workspace, docker, config);
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('should perform full orchestration: manifest writing and Docker spawn with secrets', async () => {
    const workDir = harness.resolve('workspaces/test-mission');

    const manifest: any = {
      identifier: 'test-123',
      action: 'chat',
      workDir,
      upstreamUrl: 'https://github.com/org/repo.git',
      branchName: 'main',
      containerName: 'orbit-test-123',
      env: { SETTING: 'true' },
      sensitiveEnv: { SECRET_KEY: 'top-secret' },
      geminiAuthFiles: {
        googleAccountsJson: '{"active":"test"}',
      },
    };

    // 1. Run Orchestration (in background-ish because of verify loop)
    const orchestratePromise = orchestrator.orchestrate(manifest);

    // 2. Simulate Worker Signaling READY
    const statePath = path.join(workDir, '.gemini/orbit/state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ status: 'IDLE' }));

    const receipt = await orchestratePromise;

    // 3. Verify Result
    expect(receipt.missionId).toBe('test-123');

    // 3. Verify Docker Spawn (The "Ignition")
    const history = harness.getHistory();
    const dockerCall = history.find((h) => h.includes('docker run'));
    expect(dockerCall).toBeDefined();
    expect(dockerCall).toContain('-e SETTING=true');
    expect(dockerCall).not.toContain('SECRET_KEY=top-secret');
    expect(dockerCall).toContain('--tmpfs /run/orbit/auth');
    expect(dockerCall).toContain('--name orbit-test-123');
    expect(dockerCall).toContain(`${harness.resolve('home')}:/orbit/home`);

    const manifestDir = harness.resolve('manifests');
    const manifestPath = fs
      .readdirSync(manifestDir)
      .map((entry) => path.join(manifestDir, entry))
      .find((entry) =>
        path.basename(entry).startsWith('orbit-manifest-test-123-'),
      );
    expect(manifestPath).toBeTruthy();
    expect(fs.existsSync(manifestPath!)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(manifestPath!, 'utf8'));
    expect(saved.env.SETTING).toBe('true');
    expect(saved.sensitiveEnv).toBeUndefined();
    expect(saved.geminiAuthFiles).toBeUndefined();

    const secretMatch = dockerCall!.match(
      /-v\s+(.+):\/run\/orbit\/mission\.env:ro(?:\s|$)/,
    );
    expect(secretMatch?.[1]).toBeTruthy();
    expect(dockerCall).toContain('--tmpfs /run/orbit/auth');
  });
});

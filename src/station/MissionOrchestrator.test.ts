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
import { ProcessManager } from '../core/ProcessManager.js';
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
    harness.activate();

    const pm = new ProcessManager({}, false);
    const git = new GitExecutor(pm);
    const dockerExec = new DockerExecutor(pm, 'docker');

    const workspace = new WorkspaceManager(git);
    const docker = new DockerManager(dockerExec, pm);
    orchestrator = new MissionOrchestrator(workspace, docker);
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
    };

    // 1. Run Orchestration
    const receipt = await orchestrator.orchestrate(manifest);

    // 2. Verify Result
    expect(receipt.missionId).toBe('test-123');

    // 3. Verify Manifest File (The "Source of Truth" for the mission)
    const manifestPath = path.join(workDir, '.orbit-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(saved.env.SETTING).toBe('true');
    expect(saved.sensitiveEnv.SECRET_KEY).toBe('top-secret');

    // 4. Verify Docker Spawn (The "Ignition")
    const history = harness.getHistory();
    const dockerCall = history.find((h) => h.includes('docker run'));
    expect(dockerCall).toBeDefined();
    expect(dockerCall).toContain('-e SETTING=true');
    expect(dockerCall).toContain('-e SECRET_KEY=top-secret');
    expect(dockerCall).toContain('--name orbit-test-123');
  });
});

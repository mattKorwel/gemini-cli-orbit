/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import {
  type InfrastructureSpec,
  type ProjectContext,
  SATELLITE_WORKSPACES_PATH,
  ORBIT_ROOT,
  getPrimaryRepoRoot,
  getProjectOrbitDir,
  UPSTREAM_REPO_URL,
  BUNDLE_PATH,
  LOCAL_BUNDLE_PATH,
} from '../core/Constants.js';
import { LogLevel } from '../core/Logger.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { SessionManager } from '../utils/SessionManager.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';
import { detectRemoteUrl } from '../core/ConfigManager.js';
import { NodeExecutor } from '../core/executors/NodeExecutor.js';
import { type Command } from '../core/executors/types.js';
import {
  type OrbitObserver,
  type MissionOptions,
  type MissionResult,
  type JettisonOptions,
  type ReapOptions,
  type AttachOptions,
  type GetLogsOptions,
  type ExecOptions,
  type MissionExecOptions,
} from '../core/types.js';

export class MissionManager {
  constructor(
    private readonly projectCtx: ProjectContext,
    private readonly infra: InfrastructureSpec,
    private readonly observer: OrbitObserver,
  ) {}

  /**
   * Launch or resume an isolated developer presence.
   */
  async start(options: MissionOptions): Promise<MissionResult> {
    const { identifier, action } = options;
    const missionId = SessionManager.generateMissionId(identifier, action);

    this.observer.onLog?.(
      LogLevel.INFO,
      'MISSION',
      `🚀 Initializing '${action}' mission for ${identifier}...`,
    );

    // 1. Provider Resolution
    const provider = ProviderFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );

    const isLocalWorkspace = provider.type === 'local-worktree';
    const mCtx = resolveMissionContext(identifier, action);
    const branch = mCtx.branchName;
    const containerName = mCtx.containerName;

    // 2. Smart Resumption Check
    const capsuleStatus = await provider.getCapsuleStatus(containerName);
    if (capsuleStatus.exists && action === 'chat') {
      this.observer.onLog?.(
        LogLevel.INFO,
        'MISSION',
        `👋 Resuming existing '${action}' mission for ${identifier}...`,
      );
      return { missionId, exitCode: await this.attach({ identifier }) };
    }

    // 3. Environment Sync (Phase 0) - Only for Remote
    if (!isLocalWorkspace) {
      this.observer.onProgress?.('PHASE 0', '📦 Synchronizing environment...');

      // Lazy Sync Bundle (Trailing slash means sync contents)
      await provider.syncIfChanged(`${LOCAL_BUNDLE_PATH}/`, BUNDLE_PATH, {
        sudo: true,
      });

      // Lazy Sync Project Configs (.gemini)
      const localConfigDir = path.join(this.projectCtx.repoRoot, '.gemini');
      const remoteConfigDir = `${ORBIT_ROOT}/project-configs`;
      await provider.syncIfChanged(`${localConfigDir}/`, remoteConfigDir, {
        sudo: true,
      });
    }

    // 4. Mission Preparation (Hardware/Container Layer)
    await provider.prepareMissionWorkspace(
      identifier,
      branch,
      action,
      this.infra,
    );

    // 5. Worker Handshake (Phase 1 & 2)
    this.observer.onProgress?.(
      'PHASE 1',
      '🧪 Running worker initialization...',
    );

    const workerPath = isLocalWorkspace
      ? `${LOCAL_BUNDLE_PATH}/station.js`
      : `${BUNDLE_PATH}/station.js`;

    const policyPath = isLocalWorkspace
      ? path.join(
          this.projectCtx.repoRoot,
          '.gemini/policies/workspace-policy.toml',
        )
      : `${ORBIT_ROOT}/project-configs/policies/workspace-policy.toml`;

    const upstreamUrl = this.infra.upstreamRepo
      ? `https://github.com/${this.infra.upstreamRepo}.git`
      : detectRemoteUrl(this.projectCtx.repoRoot) || UPSTREAM_REPO_URL;

    const mirrorPath = `${ORBIT_ROOT}/main`;

    // Step A: INIT (Git layer)
    const initCmd = NodeExecutor.create(workerPath, [
      'init',
      identifier,
      branch,
      upstreamUrl,
      mirrorPath,
    ]);
    const initExitCode = await provider.exec(
      initCmd,
      this.getExecOptions(isLocalWorkspace, containerName, {
        interactive: true,
      }),
    );

    if (initExitCode !== 0) {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'MISSION',
        `❌ Git initialization failed.`,
      );
      return { missionId, exitCode: initExitCode };
    }

    // Step A.1: Setup Hooks
    const setupHooksCmd = NodeExecutor.create(workerPath, ['setup-hooks']);
    await provider.exec(
      setupHooksCmd,
      this.getExecOptions(isLocalWorkspace, containerName),
    );

    // Step B: RUN (Task layer)
    const absWorkspaceDir = isLocalWorkspace
      ? path.join(
          getProjectOrbitDir(this.projectCtx.repoRoot),
          'workspaces',
          this.projectCtx.repoName,
          mCtx.workspaceName,
        )
      : `${SATELLITE_WORKSPACES_PATH}/${this.projectCtx.repoName}/${mCtx.workspaceName}`;

    const runCmd = NodeExecutor.create(workerPath, [
      'run',
      identifier,
      branch,
      action,
      policyPath,
      absWorkspaceDir,
    ]);
    const runExitCode = await provider.exec(runCmd, {
      interactive: true,
    });

    if (runExitCode !== 0) {
      return { missionId, exitCode: runExitCode };
    }

    // 6. Finalization
    this.observer.onLog?.(
      LogLevel.INFO,
      'MISSION',
      `✅ Mission '${missionId}' ready.`,
    );

    return { missionId, exitCode: 0 };
  }

  /**
   * Drops into a raw interactive shell on the hardware host.
   */
  async stationShell(): Promise<number> {
    const provider = ProviderFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );
    await provider.ensureReady();
    this.observer.onLog?.(
      LogLevel.INFO,
      'STATION',
      `🛰️ Entering raw shell on station: ${this.infra.instanceName}`,
    );
    return provider.stationShell();
  }

  /**
   * Drops into a raw interactive shell inside a mission capsule.
   */
  async missionShell(options: { identifier: string }): Promise<number> {
    const provider = ProviderFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );
    const capsules = await provider.listCapsules();
    const target = capsules.find((c) => c.includes(options.identifier));

    if (!target) {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'SHELL',
        `❌ No active mission found for ${options.identifier}`,
      );
      return 1;
    }

    this.observer.onLog?.(
      LogLevel.INFO,
      'SHELL',
      `🛰️ Entering raw shell in capsule: ${target}`,
    );
    return provider.missionShell(target);
  }

  /**
   * Decommission a specific mission and its workspace.
   */
  async jettison(options: JettisonOptions): Promise<MissionResult> {
    const { identifier, action = 'chat' } = options;
    const provider = ProviderFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );
    const mCtx = resolveMissionContext(identifier, action);

    try {
      const capsules = await provider.listCapsules();
      const targetCapsule = capsules.find((c) => c.includes(identifier));

      if (targetCapsule) {
        await provider.stopCapsule(targetCapsule);
        await provider.removeCapsule(targetCapsule);
      }

      if (!this.infra.projectId || this.infra.projectId === 'local') {
        // Local cleanup if needed
      } else {
        const workspacePath = `${SATELLITE_WORKSPACES_PATH}/${this.projectCtx.repoName}/${mCtx.workspaceName}`;
        const rmCmd = { bin: 'rm', args: ['-rf', workspacePath] };
        await provider.exec(rmCmd);
      }

      return { missionId: identifier, exitCode: 0 };
    } catch (e: any) {
      throw new Error(`Jettison failed: ${e.message}`, { cause: e });
    }
  }

  /**
   * Identify and remove idle mission capsules.
   */
  async reap(options: ReapOptions): Promise<number> {
    const threshold = options.threshold ?? 4;
    const provider = ProviderFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );
    const capsules = await provider.listCapsules();

    let reapedCount = 0;
    for (const capsule of capsules) {
      if (capsule === 'main' || capsule === 'primary') continue;
      const idleTimeSeconds = await provider.getCapsuleIdleTime(capsule);
      const idleTimeHours = Math.floor(idleTimeSeconds / 3600);
      if (options.force || idleTimeHours >= threshold) {
        const res = await provider.removeCapsule(capsule);
        if (res === 0) reapedCount++;
      }
    }
    return reapedCount;
  }

  /**
   * Execute a one-off command inside a mission capsule.
   */
  async exec(options: MissionExecOptions): Promise<number> {
    const { identifier, command, action = 'chat' } = options;
    const provider = ProviderFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );
    const mCtx = resolveMissionContext(identifier, action);
    const capsules = await provider.listCapsules();

    const target =
      capsules.find((c) => c === mCtx.containerName) ||
      capsules.find((c) => c.includes(identifier));

    if (!target) {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'EXEC',
        `❌ No active mission found for ${identifier}`,
      );
      return 1;
    }

    const cmdObj: Command = { bin: '/bin/bash', args: ['-c', command] };
    return provider.exec(cmdObj, {
      wrapCapsule: target,
      interactive: true,
    });
  }

  /**
   * Attach to an active mission session.
   */
  async attach(options: AttachOptions): Promise<number> {
    const { identifier, action = 'chat' } = options;
    const provider = ProviderFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );
    const mCtx = resolveMissionContext(identifier, action);
    const capsules = await provider.listCapsules();

    const target =
      capsules.find((c) => c === mCtx.containerName) ||
      capsules.find((c) => c.includes(identifier));

    if (!target) {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'ATTACH',
        `❌ No active mission found for ${identifier}`,
      );
      return 1;
    }

    return provider.attach(target);
  }

  /**
   * Inspect latest mission telemetry.
   */
  async getLogs(options: GetLogsOptions): Promise<number> {
    const { identifier, action = 'review' } = options;
    const provider = ProviderFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );
    const mId = SessionManager.generateMissionId(identifier, action);
    const logPath = path.join(
      getProjectOrbitDir(this.projectCtx.repoRoot),
      `${mId}.log`,
    );

    if (fs.existsSync(logPath)) {
      console.log(fs.readFileSync(logPath, 'utf8'));
      return 0;
    }

    const mCtx = resolveMissionContext(identifier, action);
    const capsules = await provider.listCapsules();
    const target =
      capsules.find((c) => c === mCtx.containerName) ||
      capsules.find((c) => c.includes(identifier));

    if (target) {
      const catCmd = { bin: 'cat', args: ['/tmp/mission.log'] };
      await provider.exec(
        catCmd,
        this.getExecOptions(
          this.infra.providerType === 'local-worktree',
          target,
          {
            interactive: true,
          },
        ),
      );
      return 0;
    }

    return 1;
  }

  private getExecOptions(
    isLocal: boolean,
    capsuleName: string,
    overrides: Partial<ExecOptions> = {},
  ): ExecOptions {
    const options: ExecOptions = { ...overrides };
    if (!isLocal) {
      options.wrapCapsule = capsuleName;
    }
    return options;
  }
}

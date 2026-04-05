/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import {
  type InfrastructureSpec,
  type ProjectContext,
  ORBIT_ROOT,
  LOCAL_BUNDLE_PATH,
  BUNDLE_PATH,
  UPSTREAM_REPO_URL,
} from '../core/Constants.js';
import { LogLevel } from '../core/Logger.js';
import {
  type IConfigManager,
  type IProviderFactory,
} from '../core/interfaces.js';
import {
  type MissionResult,
  type ExecOptions,
  type MissionManifest,
  type OrbitObserver,
  type JettisonOptions,
  type ReapOptions,
} from '../core/types.js';
import { NodeExecutor } from '../core/executors/NodeExecutor.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';
import { SessionManager } from '../utils/SessionManager.js';
import { getPrimaryRepoRoot } from '../core/Constants.js';

/**
 * FleetCommander: SDK-level mission orchestrator.
 * High-level workflow state machine.
 */
export class MissionManager {
  constructor(
    private readonly projectCtx: ProjectContext,
    private readonly infra: InfrastructureSpec,
    private readonly observer: OrbitObserver,
    private readonly providerFactory: IProviderFactory,
    private readonly configManager: IConfigManager,
  ) {}

  /**
   * Starts a mission from an identifier (PR # or branch name).
   */
  async start(options: {
    identifier: string;
    action: string;
  }): Promise<MissionResult> {
    const { identifier, action } = options;
    const missionId = identifier;

    this.observer.onLog?.(
      LogLevel.INFO,
      'MISSION',
      `🚀 Initializing '${action}' mission for ${identifier}...`,
    );

    const mCtx = resolveMissionContext(identifier, action);
    const branch = mCtx.branchName;

    const provider = this.providerFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );

    const isLocalWorkspace = provider.isLocal;

    // 1. Ensure Hardware/Station is Ready
    await provider.ensureReady();

    // 2. Project Configuration Sync
    if (!isLocalWorkspace) {
      this.observer.onProgress?.(
        'PHASE 0',
        '📂 Synchronizing project configurations...',
      );

      // Lazy Sync Project Configs (.gemini)
      const localConfigDir = path.join(this.projectCtx.repoRoot, '.gemini');
      const remoteConfigDir = `${ORBIT_ROOT}/project-configs`;
      await provider.syncIfChanged(`${localConfigDir}/`, remoteConfigDir, {
        sudo: true,
      });
    }

    // 3. Mission Preparation (Hardware/Container Layer)
    await provider.prepareMissionWorkspace(mCtx, this.infra);

    // 4. Worker Handshake (Phases: Init, Hooks, Launch)
    this.observer.onProgress?.(
      'PHASE 1',
      '🧪 Initializing worker environment...',
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
      : this.configManager.detectRemoteUrl(this.projectCtx.repoRoot) ||
        UPSTREAM_REPO_URL;

    const mirrorPath = `${ORBIT_ROOT}/main`;

    // Calculate the actual filesystem path where the worker should operate
    const targetDir = isLocalWorkspace
      ? path.join(
          getPrimaryRepoRoot(this.projectCtx.repoRoot),
          '..',
          'workspaces',
          mCtx.workspaceName,
        )
      : ORBIT_ROOT; // On remote, ORBIT_ROOT is the workspace base

    const manifest: MissionManifest = {
      identifier,
      repoName: this.projectCtx.repoName,
      branchName: branch,
      action,
      workDir: targetDir,
      policyPath,
      sessionName: mCtx.sessionName,
      upstreamUrl,
      mirrorPath,
    };

    // SINGLE RPC CALL: Start the entire mission lifecycle in the environment
    // Note: We run this on the HOST (no wrapCapsule) because it is the setup orchestrator.
    const startCmd = NodeExecutor.create(workerPath, ['start']);
    const startExitCode = await provider.exec(startCmd, {
      interactive: true,
      manifest,
    });

    if (startExitCode !== 0) {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'MISSION',
        '❌ Mission initialization failed.',
      );
      return { missionId, exitCode: startExitCode };
    }

    // 5. Automatic Attachment (for interactive missions)
    if (action === 'chat') {
      // Give tmux a moment to spawn the session
      await new Promise((resolve) => setTimeout(resolve, 800));
      const exitCode = await this.attach({ identifier, action });
      return { missionId, exitCode };
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
    const provider = this.providerFactory.getProvider(
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
    const provider = this.providerFactory.getProvider(
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
      `🛰️ Entering mission shell: ${target}`,
    );
    return provider.missionShell(target);
  }

  /**
   * Drops into a raw interactive tmux session inside a mission capsule.
   */
  async attach(options: {
    identifier: string;
    action?: string | undefined;
  }): Promise<number> {
    const provider = this.providerFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );

    const action = options.action || 'chat';

    this.observer.onLog?.(
      LogLevel.INFO,
      'MISSION',
      `👋 Resuming existing '${action}' for ${options.identifier}...`,
    );

    // 1. Calculate canonical session name
    const mCtx = resolveMissionContext(options.identifier, action);

    // 2. Try direct attach to canonical name first (Robustness ADR 0018)
    const directRes = await provider.attach(mCtx.sessionName);
    if (directRes === 0) return 0;

    // 3. Fallback: List Capsules to find the right one (Legacy/Substring support)
    const capsules = await provider.listCapsules();
    const target = capsules.find((c) => c.includes(options.identifier));

    if (!target) {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'ATTACH',
        `❌ Could not find active mission for "${options.identifier}".`,
      );
      return 1;
    }

    // 4. Attach via Provider
    return provider.attach(target);
  }

  /**
   * Executes a one-off command in the mission capsule.
   */
  async exec(options: {
    identifier: string;
    command: string;
  }): Promise<number> {
    const provider = this.providerFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );
    const capsules = await provider.listCapsules();
    const target = capsules.find((c) => c.includes(options.identifier));

    if (!target) {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'EXEC',
        `❌ No active mission found for ${options.identifier}`,
      );
      return 1;
    }

    return provider.exec(options.command, { wrapCapsule: target });
  }

  /**
   * Removes a mission from the fleet.
   */
  async jettison(options: JettisonOptions): Promise<MissionResult> {
    const { identifier, action } = options;

    const provider = this.providerFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );

    const actionsToCleanup = action
      ? [action]
      : ['chat', 'fix', 'review', 'implement', 'ready'];

    for (const act of actionsToCleanup) {
      const mCtx = resolveMissionContext(identifier, act);

      // 1. Remove Hardware-level Workspace (Capsule / Worktree)
      await provider.removeCapsule(mCtx.containerName);

      // 2. Cleanup RAM-disk secret file (Remote Only)
      if (provider.type === 'gce') {
        const sessionId = SessionManager.generateMissionId(identifier, act);
        const secretPath = `/dev/shm/.orbit-env-${sessionId}`;
        await provider.exec(`rm -f ${secretPath}`, { quiet: true });
      }
    }

    return { missionId: identifier, exitCode: 0 };
  }

  /**
   * Removes idle mission capsules.
   */
  async reap(options: ReapOptions): Promise<number> {
    const provider = this.providerFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );
    const capsules = await provider.listCapsules();
    const threshold = options.threshold || 24; // 24 hours default

    for (const name of capsules) {
      const idleTime = await provider.getCapsuleIdleTime(name);
      if (options.force || idleTime > threshold * 3600) {
        this.observer.onLog?.(
          LogLevel.INFO,
          'REAP',
          `🔥 Reaping idle mission: ${name} (Idle for ${Math.round(
            idleTime / 3600,
          )}h)`,
        );
        await provider.removeCapsule(name);
      }
    }
    return 0;
  }

  /**
   * Retrieves logs from a mission capsule.
   */
  async getLogs(options: { identifier: string }): Promise<number> {
    const provider = this.providerFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );
    const capsules = await provider.listCapsules();
    const target = capsules.find((c) => c.includes(options.identifier));

    if (!target) {
      throw new Error(`❌ No active mission found for ${options.identifier}`);
    }

    const logs = await provider.capturePane(target);
    console.log(logs);
    return 0;
  }

  /**
   * Helper to build ExecOptions for mission commands.
   */
  private getExecOptions(
    _isLocal: boolean,
    capsuleName: string,
    overrides: Partial<ExecOptions> = {},
  ): ExecOptions {
    const options: ExecOptions = { ...overrides };
    options.wrapCapsule = capsuleName;
    return options;
  }
}

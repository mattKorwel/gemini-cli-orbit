/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  type InfrastructureSpec,
  type ProjectContext,
  UPSTREAM_REPO_URL,
} from '../core/Constants.js';
import { LogLevel } from '../core/Logger.js';
import {
  type IConfigManager,
  type IProviderFactory,
  type IStationRegistry,
  type IProcessManager,
} from '../core/interfaces.js';
import {
  type MissionResult,
  type MissionOptions,
  type MissionManifest,
  type OrbitObserver,
  type JettisonOptions,
  type ReapOptions,
  type GetLogsOptions,
} from '../core/types.js';
import {
  resolveMissionContext,
  type MissionContext,
} from '../utils/MissionUtils.js';
import { type IExecutors } from '../core/interfaces.js';

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
    private readonly pm: IProcessManager,
    private readonly executors: IExecutors,
    private readonly stationRegistry: IStationRegistry,
  ) {}

  /**
   * Stage 2 Hydration: Resolves user intent into a concrete MissionManifest.
   */
  async resolve(options: MissionOptions): Promise<MissionManifest> {
    const { identifier: rawIdentifier, action: rawAction } = options;

    const provider = this.providerFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );

    // 1. Resolve Raw Metadata
    const {
      branchName,
      repoSlug,
      idSlug,
      action: resolvedAction,
    } = resolveMissionContext(rawIdentifier, this.projectCtx.repoName, this.pm);

    const action = rawAction === 'chat' ? resolvedAction : rawAction;
    const identifier = idSlug;

    const workspaceName = provider.resolveWorkspaceName(repoSlug, idSlug);
    const containerName = provider.resolveContainerName(
      repoSlug,
      idSlug,
      action,
    );
    const sessionName = provider.resolveSessionName(repoSlug, idSlug, action);
    const workDir = provider.resolveWorkDir(workspaceName);
    const policyPath = provider.resolvePolicyPath(workDir);

    const upstreamUrl =
      this.infra.upstreamUrl ||
      (this.infra.upstreamRepo
        ? `https://github.com/${this.infra.upstreamRepo}.git`
        : this.configManager.detectRemoteUrl(this.projectCtx.repoRoot) ||
          UPSTREAM_REPO_URL);
    this.infra.upstreamUrl = upstreamUrl;

    return {
      identifier,
      repoName: this.projectCtx.repoName,
      branchName,
      action,
      workspaceName,
      workDir,
      containerName,
      sessionName,
      policyPath,
      upstreamUrl,
      mirrorPath: provider.resolveMirrorPath(),
      verbose: this.infra.verbose,
      tempDir: workDir,
    };
  }

  /**
   * Starts a mission from a pre-hydrated manifest.
   */
  async start(manifest: MissionManifest): Promise<MissionResult> {
    const { identifier, action } = manifest;
    const missionId = identifier;

    this.observer.onLog?.(
      LogLevel.INFO,
      'MISSION',
      `🚀 Initializing '${action}' mission for ${identifier}...`,
    );

    const provider = this.providerFactory.getProvider(
      this.projectCtx,
      this.infra as any,
    );

    // 1. Resolve naming authority components for the provider
    const { repoSlug, idSlug } = resolveMissionContext(
      identifier,
      this.projectCtx.repoName,
      this.pm,
    );

    // Ensure infra has the upstreamUrl from manifest for downstream providers
    this.infra.upstreamUrl = manifest.upstreamUrl;

    const mCtx: MissionContext = {
      branchName: manifest.branchName,
      repoSlug,
      idSlug,
      action: manifest.action,
      workspaceName: provider.resolveWorkspaceName(repoSlug, idSlug),
      containerName: manifest.containerName,
      sessionName: manifest.sessionName,
      upstreamUrl: manifest.upstreamUrl,
    };

    // ADR 0018: Explicitly set tempDir to workDir for log isolation
    manifest.tempDir = mCtx.workspaceName;
    const workDir = provider.resolveWorkDir(mCtx.workspaceName);
    manifest.workDir = workDir;
    manifest.tempDir = workDir;

    // 2. Ensure Hardware/Station is Ready
    await provider.ensureReady();

    // 3. Standardized Station Registration (Implicit Liftoff)
    this.stationRegistry.saveReceipt(provider.getStationReceipt());

    // Project Configuration Sync
    this.observer.onProgress?.(
      'PHASE 0',
      '📂 Synchronizing project configurations...',
    );

    // 1. Sync global user settings (Auth, etc.)
    await provider.syncGlobalConfig();

    // 2. Lazy Sync Project Configs (.gemini)
    const localConfigDir = path.join(this.projectCtx.repoRoot, '.gemini');
    const targetConfigDir = provider.resolveProjectConfigDir();
    await provider.syncIfChanged(`${localConfigDir}/`, targetConfigDir, {
      sudo: true,
    });

    // 5. Mission Preparation (Hardware/Container Layer)
    // Gather sensitive credentials from local environment
    const sensitiveEnv: Record<string, string> = {};
    const creds = ['GH_TOKEN', 'GITHUB_TOKEN', 'GEMINI_API_KEY'];
    creds.forEach((key) => {
      if (process.env[key]) sensitiveEnv[key] = process.env[key]!;
    });

    // ADR: Also try to extract token from gh hosts.yml if not in env
    if (!sensitiveEnv.GH_TOKEN && !sensitiveEnv.GITHUB_TOKEN) {
      try {
        const ghConfigPath = path.join(os.homedir(), '.config/gh/hosts.yml');
        if (fs.existsSync(ghConfigPath)) {
          const content = fs.readFileSync(ghConfigPath, 'utf8');
          const match = content.match(/oauth_token:\s+([^\s\n]+)/);
          if (match && match[1]) {
            sensitiveEnv.GH_TOKEN = match[1];
          }
        }
      } catch (_e) {
        // Fallback or skip
      }
    }

    await provider.prepareMissionWorkspace(mCtx, {
      ...this.infra,
      sensitiveEnv: {
        ...(this.infra as any).sensitiveEnv,
        ...sensitiveEnv,
      },
    } as any);

    // 6. Worker Handshake (Phases: Init, Hooks, Launch)
    this.observer.onProgress?.(
      'PHASE 1',
      '🧪 Initializing worker environment...',
    );

    const workerPath = provider.resolveWorkerPath();

    // Give the container a moment to settle and mounts to stabilize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // SINGLE RPC CALL: Start the entire mission lifecycle in the environment
    const startCmd = provider.createNodeCommand(workerPath, ['start']);
    const startRes = await provider.getMissionExecOutput(startCmd, mCtx, {
      interactive: false,
      manifest,
      env: sensitiveEnv,
      sensitiveEnv, // Pass explicitly for providers that handle secrets uniquely
    });

    if (startRes.status !== 0) {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'MISSION',
        `❌ Mission initialization failed (Status ${startRes.status}).\n` +
          `STDOUT: ${startRes.stdout}\n` +
          `STDERR: ${startRes.stderr}`,
      );
      return { missionId, exitCode: startRes.status };
    }

    // 7. Automatic Attachment (for interactive missions)
    if (action === 'chat') {
      // Give tmux a moment to spawn the session
      await new Promise((resolve) => setTimeout(resolve, 800));
      const exitCode = await this.attach({ identifier, action });
      return { missionId, exitCode };
    }

    // 8. Finalization
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

    // 1. Calculate canonical session name via Provider Hook
    const {
      repoSlug,
      idSlug,
      action: resolvedAction,
    } = resolveMissionContext(
      options.identifier,
      this.projectCtx.repoName,
      this.pm,
    );
    const action = options.action || resolvedAction;

    this.observer.onLog?.(
      LogLevel.INFO,
      'MISSION',
      `👋 Resuming existing '${action}' for ${idSlug}...`,
    );

    const sessionName = provider.resolveSessionName(repoSlug, idSlug, action);

    // 2. Try direct attach to canonical name first
    const directRes = await provider.attach(sessionName);
    if (directRes === 0) return 0;

    // 3. Fallback: List Capsules to find the right one (Legacy support)
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
    const { branchName, repoSlug, idSlug } = resolveMissionContext(
      options.identifier,
      this.projectCtx.repoName,
      this.pm,
    );
    const mCtx: MissionContext = {
      branchName,
      repoSlug,
      idSlug,
      action: 'chat', // Fixed missionShell always starts a chat session
      workspaceName: provider.resolveWorkspaceName(repoSlug, idSlug),
      containerName: provider.resolveContainerName(repoSlug, idSlug, 'chat'),
      sessionName: provider.resolveSessionName(repoSlug, idSlug, 'chat'),
    };

    return provider.execMission(options.command, mCtx);
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

    // Delegate ALL cleanup (sessions, worktrees, and secrets) to the provider.
    // This ensures surgical cleanup for specific actions vs. full mission cleanup.
    const exitCode = await provider.jettisonMission(identifier, action);

    return { missionId: identifier, exitCode };
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
  async getLogs(options: GetLogsOptions): Promise<number> {
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
}

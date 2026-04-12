/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import {
  type MissionManifest,
  type MissionResult,
  type MissionOptions,
  type JettisonOptions,
  type ReapOptions,
  type GetLogsOptions,
} from '../core/types.js';
import {
  type IOrbitObserver,
  type IProviderFactory,
  type IConfigManager,
  type IStationRegistry,
  type IProcessManager,
  type IExecutors,
} from '../core/interfaces.js';
import { LogLevel } from '../core/Logger.js';
import {
  type ProjectContext,
  type InfrastructureSpec,
  UPSTREAM_REPO_URL,
  GLOBAL_GH_CONFIG,
} from '../core/Constants.js';
import {
  resolveMissionContext,
  type MissionContext,
} from '../utils/MissionUtils.js';
import { type StarfleetClient } from './StarfleetClient.js';
import { loadAuthEnvChain } from '../utils/EnvResolver.js';
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';

type GitAuthMode = 'host-gh-config' | 'repo-token' | 'none';
type GeminiAuthMode = 'env-chain' | 'accounts-file' | 'none';

/**
 * MissionManager: Orchestrates the mission lifecycle across different providers.
 */
export class MissionManager {
  private _cachedProvider:
    | import('../providers/BaseProvider.js').BaseProvider
    | null = null;

  constructor(
    private readonly projectCtx: ProjectContext,
    private readonly infra: InfrastructureSpec,
    private readonly observer: IOrbitObserver,
    private readonly providerFactory: IProviderFactory,
    private readonly configManager: IConfigManager,
    private readonly pm: IProcessManager,
    private readonly executors: IExecutors,
    private readonly stationRegistry: IStationRegistry,
    private readonly starfleetClient: StarfleetClient,
    private readonly state?: InfrastructureState,
    private readonly provider?: import('../providers/BaseProvider.js').BaseProvider,
    private fleet?: import('./FleetManager.js').FleetManager,
  ) {
    if (provider) this._cachedProvider = provider;
  }

  public setFleetManager(fleet: import('./FleetManager.js').FleetManager) {
    this.fleet = fleet;
  }

  private getProvider() {
    if (this._cachedProvider) return this._cachedProvider;
    this._cachedProvider = this.providerFactory.getProvider(
      this.projectCtx,
      this.infra as any,
      this.state,
    );
    return this._cachedProvider;
  }

  private sanitizeMissionEnv(
    env: Record<string, string> | undefined,
  ): Record<string, string> | undefined {
    if (!env) return undefined;

    const blockedPrefixes = ['GCLI_ORBIT_', 'ORBIT_'];
    const blockedExact = new Set([
      'DOCKER_HOST',
      'COMPOSE_FILE',
      'COMPOSE_PROJECT_NAME',
    ]);

    const sanitized = Object.fromEntries(
      Object.entries(env).filter(([key]) => {
        if (blockedExact.has(key)) return false;
        return !blockedPrefixes.some((prefix) => key.startsWith(prefix));
      }),
    );

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  /**
   * Stage 2 Hydration: Resolves user intent into a concrete MissionManifest.
   */
  async resolve(options: MissionOptions): Promise<MissionManifest> {
    const { identifier: rawIdentifier, action: rawAction } = options;

    const provider = this.getProvider();

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
    const hostWorkDir = provider.resolveWorkDir(workspaceName);
    const workDir = (provider as any).resolveCapsuleWorkDir
      ? (provider as any).resolveCapsuleWorkDir(workspaceName)
      : hostWorkDir;
    const policyPath = provider.resolvePolicyPath();

    const isDev = options.dev ?? false;
    const gitAuthMode =
      options.gitAuthMode ||
      this.infra.gitAuthMode ||
      (provider.type === 'local-docker' ? 'host-gh-config' : 'repo-token');
    const geminiAuthMode =
      options.geminiAuthMode || this.infra.geminiAuthMode || 'env-chain';

    const upstreamUrl =
      this.infra.upstreamUrl ||
      (this.infra.upstreamRepo
        ? `https://github.com/${this.infra.upstreamRepo}.git`
        : this.configManager.detectRemoteUrl(this.projectCtx.repoRoot) ||
          UPSTREAM_REPO_URL);
    this.infra.upstreamUrl = upstreamUrl;

    const manifest: MissionManifest = {
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
      verbose: this.infra.verbose,
      isDev: isDev,
      gitAuthMode,
      geminiAuthMode,
      tempDir: workDir,
      env: this.sanitizeMissionEnv(this.infra.env),
      sensitiveEnv: this.infra.sensitiveEnv,
    };

    // Starfleet stations own their runtime layout via baked supervisor config.
    // Only local-worktree still needs station path details carried in manifest.
    if (provider.type === 'local-worktree') {
      manifest.mirrorPath = provider.resolveMirrorPath();
      manifest.bundleDir = provider.resolveBundlePath();
    }

    return manifest;
  }

  private resolveMissionSensitiveEnv(manifest: MissionManifest): {
    sensitiveEnv: Record<string, string>;
    warnings: string[];
  } {
    const authEnv = loadAuthEnvChain(this.projectCtx.repoRoot);
    const sensitiveEnv: Record<string, string> = {
      ...((this.infra as any).sensitiveEnv || {}),
      ...(manifest.sensitiveEnv || {}),
    };
    const warnings: string[] = [];
    const gitAuthMode = (manifest.gitAuthMode || 'repo-token') as GitAuthMode;
    const geminiAuthMode = (manifest.geminiAuthMode ||
      'env-chain') as GeminiAuthMode;

    if (geminiAuthMode === 'env-chain') {
      const geminiApiKey =
        process.env.GEMINI_API_KEY ||
        authEnv.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        authEnv.GOOGLE_API_KEY;
      if (geminiApiKey) {
        sensitiveEnv.GEMINI_API_KEY = geminiApiKey;
      }
    }

    if (gitAuthMode === 'repo-token') {
      const repoToken =
        this.infra.repoToken ||
        process.env.GCLI_ORBIT_REPO_TOKEN ||
        authEnv.GCLI_ORBIT_REPO_TOKEN ||
        process.env.WORKSPACE_GH_TOKEN ||
        authEnv.WORKSPACE_GH_TOKEN;

      if (repoToken) {
        sensitiveEnv.GH_TOKEN = repoToken;
        sensitiveEnv.GITHUB_TOKEN = repoToken;
      } else if (fs.existsSync(GLOBAL_GH_CONFIG)) {
        try {
          const content = fs.readFileSync(GLOBAL_GH_CONFIG, 'utf8');
          const match = content.match(/oauth_token:\s+([^\s\n]+)/);
          if (match && match[1]) {
            sensitiveEnv.GH_TOKEN = match[1];
            sensitiveEnv.GITHUB_TOKEN = match[1];
            warnings.push(
              'Using global GitHub auth fallback for this mission. Configure repoToken or GCLI_ORBIT_REPO_TOKEN to reduce scope.',
            );
          }
        } catch (e: any) {
          this.observer.onLog?.(
            LogLevel.DEBUG,
            'AUTH',
            `Failed to read GH config: ${e.message}`,
          );
        }
      }
    }

    return { sensitiveEnv, warnings };
  }

  /**
   * Starts a mission from a pre-hydrated manifest.
   */
  async start(manifest: MissionManifest): Promise<MissionResult> {
    const { identifier, action } = manifest;
    const missionId = identifier;

    const provider = this.getProvider();

    // --- PHASE 0: SITUATIONAL AWARENESS (Wake-on-Mission) ---
    // If the station is hibernated, we must wake it before proceeding.
    const receipt = provider.getStationReceipt();
    if (receipt && this.fleet) {
      const stations = await this.stationRegistry.listStations({
        syncWithReality: true,
      });
      const current = stations.find((s) => s.receipt.name === receipt.name);
      if (
        current?.receipt?.status === 'HIBERNATED' ||
        current?.receipt?.status === 'TERMINATED'
      ) {
        this.observer.onLog?.(
          LogLevel.INFO,
          'MISSION',
          `💤 Station '${receipt.name}' is hibernated. Waking up...`,
        );
        await this.fleet.provision({ instanceName: receipt.name } as any);
      }
    }

    this.observer.onLog?.(
      LogLevel.DEBUG,
      'MISSION',
      `Provider resolved: ${provider.type}`,
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
    const hostWorkDir = provider.resolveWorkDir(mCtx.workspaceName);
    const capsuleWorkDir = (provider as any).resolveCapsuleWorkDir
      ? (provider as any).resolveCapsuleWorkDir(mCtx.workspaceName)
      : hostWorkDir;

    manifest.workDir = capsuleWorkDir;
    manifest.tempDir = capsuleWorkDir;
    const { sensitiveEnv: resolvedSensitiveEnv, warnings: authWarnings } =
      this.resolveMissionSensitiveEnv(manifest);
    manifest.sensitiveEnv = resolvedSensitiveEnv;

    authWarnings.forEach((warning) => {
      this.observer.onLog?.(LogLevel.WARN, 'AUTH', warning);
    });

    // --- PHASE 1: IGNITION ---
    this.observer.onLog?.(
      LogLevel.DEBUG,
      'MISSION',
      'Verifying station ignition...',
    );
    const ignited = await provider.verifyIgnition(this.observer);
    if (!ignited) {
      throw new Error(`Station ignition failed for ${manifest.identifier}`);
    }

    // --- LOCAL WORKTREE DIRECT PATH ---
    if (provider.type === 'local-worktree' && (provider as any).launchMission) {
      this.observer.onLog?.(
        LogLevel.DEBUG,
        'MISSION',
        'Entering local-worktree direct path',
      );

      await provider.ensureReady();
      this.stationRegistry.saveReceipt(provider.getStationReceipt());
      await provider.prepareMissionWorkspace(mCtx, {
        ...this.infra,
        sensitiveEnv: {
          ...(this.infra as any).sensitiveEnv,
          ...resolvedSensitiveEnv,
        },
      } as any);

      this.observer.onProgress?.(
        'PHASE 1',
        '🚀 Launching local worktree mission...',
      );

      const exitCode = await (provider as any).launchMission(manifest);
      if (exitCode !== 0) {
        throw new Error(
          `Local worktree launch failed for ${manifest.identifier}`,
        );
      }

      return { missionId: manifest.identifier, exitCode: 0 };
    }

    // --- STARFLEET FAST-PATH ---
    if ((provider as any).launchMission) {
      this.observer.onLog?.(
        LogLevel.DEBUG,
        'MISSION',
        'Entering Starfleet fast-path',
      );
      this.observer.onProgress?.(
        'PHASE 1',
        '🚀 Launching Starfleet Mission...',
      );
      const exitCode = await (provider as any).launchMission(
        manifest,
        hostWorkDir,
      );
      if (exitCode === 0) {
        this.stationRegistry.saveReceipt(provider.getStationReceipt());

        if (action === 'chat') {
          // Give tmux a moment to spawn the session
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const attachCode = await this.attach({ identifier, action });
          return { missionId: manifest.identifier, exitCode: attachCode };
        }

        return { missionId: manifest.identifier, exitCode: 0 };
      }
      throw new Error(`Starfleet launch failed for ${manifest.identifier}`);
    }

    // 2. Ensure Hardware/Station is Ready
    await provider.ensureReady();

    // 3. Standardized Station Registration (Implicit Liftoff)
    this.stationRegistry.saveReceipt(provider.getStationReceipt());

    // Project Configuration Sync
    this.observer.onProgress?.(
      'PHASE 0',
      '📂 Synchronizing project configurations...',
    );

    // 1. Lazy Sync Project Configs (.gemini)
    const localConfigDir = path.join(this.projectCtx.repoRoot, '.gemini');
    const targetConfigDir = provider.resolveProjectConfigDir();
    await provider.syncIfChanged(`${localConfigDir}/`, targetConfigDir, {
      sudo: true,
    });

    await provider.prepareMissionWorkspace(mCtx, {
      ...this.infra,
      sensitiveEnv: {
        ...(this.infra as any).sensitiveEnv,
        ...resolvedSensitiveEnv,
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
      stream: true, // Provide real-time feedback during initialization
      env: resolvedSensitiveEnv,
      sensitiveEnv: resolvedSensitiveEnv, // Pass explicitly for providers that handle secrets uniquely
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
    const provider = this.getProvider();
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
    const provider = this.getProvider();
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
    const provider = this.getProvider();

    // 1. Calculate canonical names
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

    const launchedContainerName =
      typeof (provider as any).getLaunchedContainerName === 'function'
        ? (provider as any).getLaunchedContainerName(options.identifier)
        : undefined;
    const containerName =
      launchedContainerName ||
      provider.resolveContainerName(repoSlug, idSlug, action);
    const sessionName = provider.resolveSessionName(repoSlug, idSlug, action);

    this.observer.onLog?.(
      LogLevel.DEBUG,
      'ATTACH',
      `Direct attach attempt: container=${containerName}, session=${sessionName}`,
    );

    // 2. Try direct attach to canonical container first
    const directRes = await provider.attach(containerName, sessionName);
    this.observer.onLog?.(
      LogLevel.DEBUG,
      'ATTACH',
      `Direct attach result: ${directRes}`,
    );
    if (directRes === 0) return 0;

    // 3. Fallback: List Capsules to find the right one (Legacy support or slug mismatch)
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

    // 4. Attach via Provider with identified container
    return provider.attach(target, sessionName);
  }

  /**
   * Executes a one-off command in the mission capsule.
   */
  async exec(options: {
    identifier: string;
    command: string;
  }): Promise<number> {
    const provider = this.getProvider();
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

    const provider = this.getProvider();

    // Delegate ALL cleanup (sessions, worktrees, and secrets) to the provider.
    // This ensures surgical cleanup for specific actions vs. full mission cleanup.
    const exitCode = await provider.jettisonMission(identifier, action);

    return { missionId: identifier, exitCode };
  }

  /**
   * Removes idle mission capsules.
   */
  async reap(options: ReapOptions): Promise<number> {
    const provider = this.getProvider();
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
    const provider = this.getProvider();
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

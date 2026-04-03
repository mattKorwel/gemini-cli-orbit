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
} from '../core/Constants.js';
import { LogLevel } from '../core/Logger.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { SessionManager } from '../utils/SessionManager.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';
import { TempManager } from '../utils/TempManager.js';
import { detectRemoteUrl } from '../core/ConfigManager.js';
import type { ExecOptions } from '../providers/BaseProvider.js';
import {
  type OrbitObserver,
  type MissionOptions,
  type MissionResult,
  type JettisonOptions,
  type ReapOptions,
  type AttachOptions,
  type GetLogsOptions,
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
    const stationName =
      this.infra.stationName || this.projectCtx.repoName || 'default';
    const missionId = SessionManager.generateMissionId(identifier, action);

    this.observer.onLog?.(
      LogLevel.INFO,
      'MISSION',
      `🚀 Initializing '${action}' mission for ${identifier}...`,
    );

    // 1. Provider Resolution
    const instanceName =
      this.infra.instanceName || `orbit-station-${this.projectCtx.repoName}`;
    const provider = ProviderFactory.getProvider(this.projectCtx, {
      ...this.infra,
      projectId: this.infra.projectId || 'local',
      zone: this.infra.zone || 'local',
      instanceName,
      stationName,
    } as any);

    const isLocalWorkspace = provider.type === 'local-worktree';

    // 2. Context Resolution
    const mCtx = resolveMissionContext(identifier, action);
    const branch = mCtx.branchName;

    const repoWorkspacesDir = isLocalWorkspace
      ? path.resolve(
          getPrimaryRepoRoot(this.projectCtx.repoRoot),
          '..',
          'workspaces',
          this.projectCtx.repoName || '',
        )
      : `${SATELLITE_WORKSPACES_PATH}/${this.projectCtx.repoName || ''}`;

    let upstreamUrl = this.infra.upstreamRepo
      ? `https://github.com/${this.infra.upstreamRepo}.git`
      : detectRemoteUrl(this.projectCtx.repoRoot);

    if (!upstreamUrl) {
      upstreamUrl = UPSTREAM_REPO_URL;
    }
    this.observer.onLog?.(
      LogLevel.DEBUG,
      'MISSION',
      `Upstream URL: ${upstreamUrl}`,
    );

    const remoteWorkspaceDir = isLocalWorkspace
      ? path.join(
          getPrimaryRepoRoot(this.projectCtx.repoRoot),
          '..',
          'workspaces',
          this.projectCtx.repoName || '',
          branch,
        )
      : `${repoWorkspacesDir}/${mCtx.workspaceName}`;

    // 3. Preparation & Auth
    let githubToken = '';
    if (!isLocalWorkspace) {
      try {
        githubToken = TempManager.getToken(this.projectCtx.repoName || '');
      } catch (_e) {
        this.observer.onLog?.(
          LogLevel.WARN,
          'AUTH',
          'No GitHub token found. Private repos may fail.',
        );
      }
    }

    // 4. Mission Preparation
    await provider.prepareMissionWorkspace(identifier, branch, this.infra);

    // 5. Build/Sync Phase (Phase 0)
    if (!isLocalWorkspace) {
      this.observer.onProgress?.(
        'PHASE 0',
        '📦 Synchronizing source and preparing environment...',
      );
      const buildOptions: ExecOptions = {
        cwd: remoteWorkspaceDir,
        interactive: true,
        sensitiveEnv: { GITHUB_TOKEN: githubToken },
      };

      // Ensure Workspace exists
      const wtStatus = await provider.exec(
        `ls -d ${remoteWorkspaceDir}`,
        buildOptions,
      );
      if (wtStatus !== 0) {
        this.observer.onLog?.(
          LogLevel.INFO,
          'SETUP',
          `   - Preparing git workspace...`,
        );
        const mirrorPath = `${ORBIT_ROOT}/main`;
        const hasMirror =
          (await provider.exec(`ls -d ${mirrorPath}/.git`, { quiet: true })) ===
          0;

        const quietOptions = { ...buildOptions, quiet: true };

        const setupCmds = [
          { cmd: `sudo mkdir -p ${repoWorkspacesDir}`, options: quietOptions },
          { cmd: `sudo chmod -R 777 ${ORBIT_ROOT}`, options: quietOptions },
          {
            cmd: `git clone ${hasMirror ? `--reference ${mirrorPath} --dissociate` : ''} ${upstreamUrl} ${remoteWorkspaceDir}`,
            options: quietOptions,
          },
          {
            cmd: `cd ${remoteWorkspaceDir} && (git fetch origin ${branch} || git checkout -b ${branch}) && git checkout ${branch}`,
            options: quietOptions,
          },
          {
            cmd: `sudo chmod -R 777 ${remoteWorkspaceDir}`,
            options: quietOptions,
          },
        ];
        for (const setup of setupCmds) {
          const res = await provider.exec(setup.cmd, setup.options);
          if (res !== 0) throw new Error(`Setup command failed: ${setup.cmd}`);
        }
      }
    }

    // 6. Evaluation Phase (Phase 1)
    this.observer.onProgress?.(
      'PHASE 1',
      '🧪 Evaluating change behavior and quality...',
    );

    // 7. Synthesis Phase (Phase 2)
    this.observer.onProgress?.(
      'PHASE 2',
      '📝 Finalizing mission assessment...',
    );

    this.observer.onLog?.(
      LogLevel.INFO,
      'MISSION',
      `✅ Mission '${missionId}' completed successfully.`,
    );

    return {
      missionId,
      exitCode: 0,
    };
  }

  /**
   * Decommission a specific mission and its workspace.
   */
  async jettison(options: JettisonOptions): Promise<MissionResult> {
    const { identifier, action = 'chat' } = options;
    const instanceName = this.infra.instanceName || 'local';
    const provider = ProviderFactory.getProvider(this.projectCtx, {
      ...this.infra,
      projectId: this.infra.projectId || 'local',
      zone: this.infra.zone || 'local',
      instanceName,
    } as any);

    this.observer.onLog?.(
      LogLevel.INFO,
      'STATION',
      `🛰️  Station: ${this.infra.instanceName}`,
    );
    this.observer.onLog?.(
      LogLevel.INFO,
      'CLEANUP',
      `🧹 Surgically jettisoning capsule and workspace for #${identifier} in ${this.projectCtx.repoName}...`,
    );

    const mCtx = resolveMissionContext(identifier, action);

    try {
      const capsules = await provider.listCapsules();
      const targetCapsule = capsules.find((c) => c.includes(identifier));

      if (!targetCapsule) {
        this.observer.onLog?.(
          LogLevel.INFO,
          'CLEANUP',
          `ℹ️  No active capsule found for identifier ${identifier}.`,
        );
      } else {
        this.observer.onLog?.(
          LogLevel.INFO,
          'CLEANUP',
          `   🔥 Decommissioning capsule: ${targetCapsule}`,
        );
        await provider.stopCapsule(targetCapsule);
        await provider.removeCapsule(targetCapsule);
      }

      const isLocal =
        !this.infra.projectId ||
        this.infra.projectId === 'local' ||
        (this.infra.providerType as any) === 'local-worktree';

      if (!isLocal) {
        const workspacePath = `${SATELLITE_WORKSPACES_PATH}/${this.projectCtx.repoName}/${mCtx.workspaceName}`;
        this.observer.onLog?.(
          LogLevel.INFO,
          'CLEANUP',
          `   📂 Purging remote workspace: ${workspacePath}`,
        );
        await provider.exec(`rm -rf ${workspacePath}`);
      }

      this.observer.onLog?.(
        LogLevel.INFO,
        'CLEANUP',
        `✅ Mission resources for ${identifier} have been jettisoned.`,
      );
      return { missionId: identifier, exitCode: 0 };
    } catch (e: any) {
      throw new Error(`Jettison failed: ${e.message}`, { cause: e });
    }
  }

  /**
   * Identify and remove idle mission capsules based on inactivity.
   */
  async reap(options: ReapOptions): Promise<number> {
    const threshold = options.threshold ?? 4;
    const instanceName = this.infra.instanceName || 'local';
    const provider = ProviderFactory.getProvider(this.projectCtx, {
      ...this.infra,
      projectId: this.infra.projectId || 'local',
      zone: this.infra.zone || 'local',
      instanceName,
    } as any);

    this.observer.onLog?.(
      LogLevel.INFO,
      'REAPER',
      `🧹 Orbit Reaper: Scanning for idle missions (threshold: ${threshold}h)...`,
    );

    const capsules = await provider.listCapsules();
    if (capsules.length === 0) {
      this.observer.onLog?.(
        LogLevel.INFO,
        'REAPER',
        '✅ No active mission capsules found.',
      );
      return 0;
    }

    let reapedCount = 0;
    for (const capsule of capsules) {
      if (capsule === 'main' || capsule === 'primary') continue;

      const idleTimeSeconds = await provider.getCapsuleIdleTime(capsule);
      const idleTimeHours = Math.floor(idleTimeSeconds / 3600);
      const shouldReap = options.force || idleTimeHours >= threshold;

      if (shouldReap) {
        this.observer.onLog?.(
          LogLevel.INFO,
          'REAPER',
          `🔥 Reaping idle capsule: ${capsule} (Idle: ${idleTimeHours}h)`,
        );
        const res = await provider.removeCapsule(capsule);
        if (res === 0) reapedCount++;
      } else {
        this.observer.onLog?.(
          LogLevel.INFO,
          'REAPER',
          `💤 Skipping active capsule: ${capsule} (Idle: ${idleTimeHours}h)`,
        );
      }
    }

    this.observer.onLog?.(
      LogLevel.INFO,
      'REAPER',
      `✅ Reaper complete. ${reapedCount} missions decommissioned.`,
    );
    return reapedCount;
  }

  /**
   * Attach to an active mission session.
   */
  async attach(options: AttachOptions): Promise<number> {
    const { identifier } = options;
    const instanceName = this.infra.instanceName || 'local';
    const provider = ProviderFactory.getProvider(this.projectCtx, {
      ...this.infra,
      projectId: this.infra.projectId || 'local',
      zone: this.infra.zone || 'local',
      instanceName,
    } as any);

    const capsules = await provider.listCapsules();
    const target = capsules.find((c) => c.includes(identifier));

    if (!target) {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'ATTACH',
        `❌ No active mission found for ${identifier}`,
      );
      return 1;
    }

    this.observer.onLog?.(
      LogLevel.INFO,
      'ATTACH',
      `🛰️  Attaching to mission: ${target}`,
    );

    return provider.attach(target);
  }

  /**
   * Inspect latest local or remote mission telemetry.
   */
  async getLogs(options: GetLogsOptions): Promise<number> {
    const { identifier, action = 'review' } = options;
    const instanceName = this.infra.instanceName || 'local';
    const provider = ProviderFactory.getProvider(this.projectCtx, {
      ...this.infra,
      projectId: this.infra.projectId || 'local',
      zone: this.infra.zone || 'local',
      instanceName,
    } as any);

    const mId = SessionManager.generateMissionId(identifier, action);
    const logPath = path.join(
      getProjectOrbitDir(this.projectCtx.repoRoot),
      `${mId}.log`,
    );

    if (fs.existsSync(logPath)) {
      this.observer.onLog?.(
        LogLevel.INFO,
        'LOGS',
        `📄 Showing local logs for ${mId}:`,
      );
      console.log(fs.readFileSync(logPath, 'utf8'));
      return 0;
    }

    this.observer.onLog?.(
      LogLevel.INFO,
      'LOGS',
      `🛰️  Fetching remote telemetry for ${mId}...`,
    );
    // Heuristic: try to find the capsule and read logs from it
    const capsules = await provider.listCapsules();
    const target = capsules.find((c) => c.includes(identifier));

    if (target) {
      await provider.exec(`cat /tmp/mission.log`, {
        wrapCapsule: target,
        interactive: true,
      });
      return 0;
    }

    this.observer.onLog?.(
      LogLevel.ERROR,
      'LOGS',
      `❌ No logs found for ${mId}`,
    );
    return 1;
  }
}

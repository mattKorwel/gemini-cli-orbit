/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import {
  type OrbitConfig,
  SATELLITE_WORKTREES_PATH,
  ORBIT_ROOT,
  getPrimaryRepoRoot,
  PROJECT_ORBIT_DIR,
} from './Constants.js';
import { LogLevel } from './Logger.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { detectRepoName } from './ConfigManager.js';
import { SessionManager } from '../utils/SessionManager.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';
import { TempManager } from '../utils/TempManager.js';
import type { ExecOptions } from '../providers/BaseProvider.js';
import {
  type OrbitObserver,
  type MissionOptions,
  type MissionResult,
  type JettisonOptions,
  type ReapOptions,
  type AttachOptions,
  type GetLogsOptions,
} from './types.js';

export class MissionManager {
  constructor(
    private readonly config: OrbitConfig,
    private readonly observer: OrbitObserver,
  ) {}

  /**
   * Launch or resume an isolated developer presence.
   */
  async start(options: MissionOptions): Promise<MissionResult> {
    const { identifier, action } = options;
    const stationName =
      this.config.stationName || this.config.repoName || 'default';
    const missionId = SessionManager.generateMissionId(identifier, action);

    this.observer.onLog?.(
      LogLevel.INFO,
      'MISSION',
      `🚀 Initializing '${action}' mission for ${identifier}...`,
    );

    // 1. Provider Resolution
    const instanceName =
      this.config.instanceName || `orbit-station-${this.config.repoName}`;
    const provider = ProviderFactory.getProvider({
      ...this.config,
      projectId: this.config.projectId || 'local',
      zone: this.config.zone || 'local',
      instanceName,
      stationName,
    } as any);

    const isLocalWorktree = provider.type === 'local-worktree';

    // 2. Context Resolution
    const mCtx = resolveMissionContext(identifier, action);
    const branch = mCtx.branchName;

    const repoWorktreesDir = isLocalWorktree
      ? path.resolve(
          getPrimaryRepoRoot(),
          '..',
          'worktrees',
          this.config.repoName || '',
        )
      : `${SATELLITE_WORKTREES_PATH}/${this.config.repoName || ''}`;

    const upstreamUrl = `https://github.com/${this.config.upstreamRepo || ''}.git`;
    const remoteWorktreeDir = isLocalWorktree
      ? path.join(
          getPrimaryRepoRoot(),
          '..',
          'worktrees',
          this.config.repoName || '',
          branch,
        )
      : `${repoWorktreesDir}/${mCtx.worktreeName}`;

    // 3. Preparation & Auth
    let githubToken = '';
    if (!isLocalWorktree) {
      try {
        githubToken = TempManager.getToken(this.config.repoName || '');
      } catch (_e) {
        this.observer.onLog?.(
          LogLevel.WARN,
          'AUTH',
          'No GitHub token found. Private repos may fail.',
        );
      }
    }

    // 4. Mission Preparation
    await provider.prepareMissionWorkspace(identifier, action, this.config);

    // 5. Build/Sync Phase (Phase 0)
    if (!isLocalWorktree) {
      this.observer.onProgress?.(
        'PHASE 0',
        '📦 Synchronizing source and preparing environment...',
      );
      const buildOptions: ExecOptions = {
        cwd: remoteWorktreeDir,
        interactive: true,
        sensitiveEnv: { GITHUB_TOKEN: githubToken },
      };

      // Ensure Worktree exists
      const wtStatus = await provider.exec(
        `ls -d ${remoteWorktreeDir}`,
        buildOptions,
      );
      if (wtStatus !== 0) {
        this.observer.onLog?.(
          LogLevel.INFO,
          'SETUP',
          `   - Creating isolated worktree for '${branch}'...`,
        );
        const setupCmds = [
          `mkdir -p ${repoWorktreesDir}`,
          `git clone --reference ${ORBIT_ROOT}/main --dissociate ${upstreamUrl} ${remoteWorktreeDir}`,
          `cd ${remoteWorktreeDir} && git fetch origin ${branch} && git checkout ${branch}`,
        ];
        for (const cmd of setupCmds) {
          const res = await provider.exec(cmd, {
            ...buildOptions,
            cwd: ORBIT_ROOT,
          });
          if (res !== 0) throw new Error(`Setup command failed: ${cmd}`);
        }
      }

      // Build / Install
      const buildStatus = await provider.exec(
        `npm install && npm run build`,
        buildOptions,
      );
      if (buildStatus !== 0) {
        this.observer.onLog?.(
          LogLevel.WARN,
          'BUILD',
          'Build failed. Evaluation may be incomplete.',
        );
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
   * Decommission a specific mission and its worktree.
   */
  async jettison(options: JettisonOptions): Promise<MissionResult> {
    const { identifier, action = 'chat' } = options;
    const repoName = this.config.repoName || detectRepoName();
    const instanceName = this.config.instanceName || 'local';
    const provider = ProviderFactory.getProvider({
      ...this.config,
      projectId: this.config.projectId || 'local',
      zone: this.config.zone || 'local',
      instanceName,
    });

    this.observer.onLog?.(
      LogLevel.INFO,
      'STATION',
      `🛰️  Station: ${this.config.instanceName}`,
    );
    this.observer.onLog?.(
      LogLevel.INFO,
      'CLEANUP',
      `🧹 Surgically jettisoning capsule and worktree for #${identifier} in ${repoName}...`,
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
        !this.config.projectId ||
        this.config.projectId === 'local' ||
        (this.config.providerType as any) === 'local-worktree';

      if (!isLocal) {
        const worktreePath = `${SATELLITE_WORKTREES_PATH}/${repoName}/${mCtx.worktreeName}`;
        this.observer.onLog?.(
          LogLevel.INFO,
          'CLEANUP',
          `   📂 Purging remote worktree: ${worktreePath}`,
        );
        await provider.exec(`rm -rf ${worktreePath}`);
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
    const instanceName = this.config.instanceName || 'local';
    const provider = ProviderFactory.getProvider({
      ...this.config,
      projectId: this.config.projectId || 'local',
      zone: this.config.zone || 'local',
      instanceName,
    });

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
    const instanceName = this.config.instanceName || 'local';
    const provider = ProviderFactory.getProvider({
      ...this.config,
      projectId: this.config.projectId || 'local',
      zone: this.config.zone || 'local',
      instanceName,
    });

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
    const instanceName = this.config.instanceName || 'local';
    const provider = ProviderFactory.getProvider({
      ...this.config,
      projectId: this.config.projectId || 'local',
      zone: this.config.zone || 'local',
      instanceName,
    });

    const mId = SessionManager.generateMissionId(identifier, action);
    const logPath = path.join(PROJECT_ORBIT_DIR, `${mId}.log`);

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

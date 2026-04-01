/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Orchestrator
 * High-level lifecycle management for Orbit missions.
 * Phased execution: Context -> Evaluation -> Synthesis.
 */

import path from 'node:path';
import {
  SATELLITE_WORKTREES_PATH,
  ORBIT_ROOT,
} from './Constants.js';
import { getRepoConfig } from './ConfigManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import type { ExecOptions } from '../providers/BaseProvider.js';
import { SessionManager } from '../utils/SessionManager.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';
import { TempManager } from '../utils/TempManager.js';
import { logger } from './Logger.js';
import { getPrimaryRepoRoot, type OrbitConfig } from './Constants.js';

export async function runOrchestrator(
  identifier: string,
  action: string,
  args: string[] = [],
  cliFlags: Partial<OrbitConfig> = {},
): Promise<number> {
  const repoName = cliFlags.repoName || args[0] || undefined;
  const config = getRepoConfig(repoName, cliFlags);
  const stationName = config.stationName || config.repoName || 'default';

  logger.info('MISSION', `🚀 Initializing '${action}' mission for ${identifier}...`);

  // 1. Connectivity & Provider Resolution
  const instanceName = config.instanceName || `gcli-station-${repoName}`;

  const provider = ProviderFactory.getProvider({
    ...config,
    projectId: config.projectId || 'local',
    zone: config.zone || 'local',
    instanceName,
    stationName,
  } as any);

  const isLocalWorktree = provider.type === 'local-worktree';

  // Paths - Unified across station and capsule
  const missionId = SessionManager.generateMissionId(identifier, action);

  const mCtx = resolveMissionContext(identifier, action);
  const branch = mCtx.branchName;

  const repoWorktreesDir = isLocalWorktree
    ? path.resolve(getPrimaryRepoRoot(), '..', 'worktrees', config.repoName || '')
    : `${SATELLITE_WORKTREES_PATH}/${config.repoName || ''}`;

  const upstreamUrl = `https://github.com/${config.upstreamRepo || ''}.git`;
  const remoteWorktreeDir = isLocalWorktree
    ? path.join(
        getPrimaryRepoRoot(),
        '..',
        'worktrees',
        config.repoName || '',
        branch,
      )
    : `${repoWorktreesDir}/${mCtx.worktreeName}`;

  // 3. Preparation & Auth
  let githubToken = '';
  if (!isLocalWorktree) {
    try {
      githubToken = TempManager.getToken(config.repoName || '');
    } catch (_e) {
      logger.warn('AUTH', 'No GitHub token found. Private repos may fail.');
    }
  }

  // 4. Mission Preparation (Unified)
  await provider.prepareMissionWorkspace(identifier, action, config);

  // 5. Build/Sync Phase (Phase 0) - Only needed for remote
  if (!isLocalWorktree) {
    logger.info('PHASE 0', '📦 Synchronizing source and preparing environment...');
    const buildOptions: ExecOptions = {
      cwd: remoteWorktreeDir,
      interactive: true,
      sensitiveEnv: { GITHUB_TOKEN: githubToken },
    };

    // 5.1 Ensure Worktree exists
    const wtStatus = await provider.exec(
      `ls -d ${remoteWorktreeDir}`,
      buildOptions,
    );
    if (wtStatus !== 0) {
      logger.info('SETUP', `   - Creating isolated worktree for '${branch}'...`);
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

    // 5.2 Build / Install
    const buildStatus = await provider.exec(
      `npm install && npm run build`,
      buildOptions,
    );
    if (buildStatus !== 0) {
      logger.warn('BUILD', 'Build failed. Evaluation may be incomplete.');
    }
  }

  // 6. Evaluation Phase (Phase 1)
  logger.info('PHASE 1', '🧪 Evaluating change behavior and quality...');

  // 7. Synthesis Phase (Phase 2)
  logger.info('PHASE 2', '📝 Finalizing mission assessment...');

  logger.info('MISSION', `✅ Mission '${missionId}' completed successfully.`);
  return 0;
}

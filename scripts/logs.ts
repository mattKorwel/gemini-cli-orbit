/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderFactory } from './providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import { resolveMissionContext } from './utils/MissionUtils.js';
import { SATELLITE_WORKTREES_PATH, DEFAULT_TEMP_DIR } from './Constants.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Logs: Unified command to inspect local or remote mission telemetry.
 */
export async function runLogs(args: string[]) {
  const identifier = args[0];
  const action = args[1] || 'review';

  if (!identifier) {
    console.error('Usage: orbit uplink <IDENTIFIER> [action]');
    return 1;
  }

  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  const mCtx = resolveMissionContext(identifier, action);

  // 1. Try Local Blackbox first
  const localPattern = `orbit-${identifier}-${action}-`;
  if (fs.existsSync(DEFAULT_TEMP_DIR)) {
    const localDirs = fs
      .readdirSync(DEFAULT_TEMP_DIR)
      .filter((d) => d.startsWith(localPattern))
      .map((d) => ({
        name: d,
        time: fs.statSync(path.join(DEFAULT_TEMP_DIR, d)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    const dir = localDirs[0];
    if (dir) {
      const latestLocal = path.join(DEFAULT_TEMP_DIR, dir.name);
      console.log(`📂 Found local mission recording: ${latestLocal}`);

      const logs = fs
        .readdirSync(latestLocal)
        .filter((f) => f.endsWith('.log'));
      if (logs.length > 0) {
        console.log('\n--- LOCAL MISSION LOG FILES ---');
        logs.forEach((log) => console.log(`- ${log}`));
        console.log(
          `\nTip: To stream these logs, run: tail -f ${latestLocal}/*.log`,
        );
        return 0;
      }
    }
  }

  // 2. Fallback to Remote Uplink
  if (!config?.projectId || config.projectId === 'local') {
    console.log(`❌ No local or remote recordings found for ${identifier}.`);
    return 1;
  }

  const { projectId, zone, dnsSuffix, userSuffix, backendType, instanceName } =
    config;
  const provider = ProviderFactory.getProvider({
    projectId: projectId!,
    zone: zone!,
    instanceName: instanceName!,
    repoName,
    dnsSuffix,
    userSuffix,
    backendType,
  });

  const containerName = mCtx.containerName;

  console.log(
    `📡 Establishing uplink to remote mission ${mCtx.branchName} (${action})...`,
  );

  // Check for active tmux sessions
  const tmuxRes = await provider.getExecOutput(
    `tmux list-sessions -F "#S" | grep ${mCtx.sessionName}`,
    { wrapCapsule: containerName },
  );
  if (tmuxRes.status === 0 && tmuxRes.stdout.trim()) {
    console.log(`🧵 Found active mission sessions:\n${tmuxRes.stdout.trim()}`);
  }

  // Look for any persistent log files in the satellite worktree
  const worktreePath = `${SATELLITE_WORKTREES_PATH}/${config.repoName}/${mCtx.worktreeName}`;
  const logDir = `${worktreePath}/.gemini/logs`;

  const logRes = await provider.getExecOutput(
    `ls -t ${logDir}/*.log | head -n 1`,
    { wrapCapsule: containerName },
  );
  if (logRes.status === 0 && logRes.stdout.trim()) {
    const latestLog = logRes.stdout.trim();
    console.log(`📄 Latest remote log: ${latestLog}`);
    console.log('\n--- LIVE REMOTE STREAM (Tip) ---');
    console.log(
      `Tip: To stream live output, run: orbit attach ${identifier} ${action}`,
    );
    return 0;
  }

  console.log(`❌ No recordings found locally or on the remote station.`);
  return 1;
}

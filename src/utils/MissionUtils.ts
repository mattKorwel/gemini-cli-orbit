/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import { sanitizeName } from '../core/ConfigManager.js';

export interface MissionContext {
  branchName: string;
  containerName: string;
  sessionName: string;
  workspaceName: string;
}

/**
 * Resolves a mission identifier (PR number or branch name) to a canonical
 * set of resource names and paths.
 */
export function resolveMissionContext(
  identifier: string,
  action: string,
): MissionContext {
  let branchName = identifier;
  let prId = identifier;
  let suffix = '';

  // Support id:name syntax (e.g. 1234:debug)
  if (identifier.includes(':')) {
    const [id, ...parts] = identifier.split(':');
    prId = id!;
    suffix = parts.join('-');
  }

  // 1. Resolve PR number to branch name via GH CLI if needed
  if (/^\d+$/.test(prId)) {
    try {
      const res = spawnSync(
        'gh',
        ['pr', 'view', prId, '--json', 'headRefName', '-q', '.headRefName'],
        { stdio: 'pipe', encoding: 'utf8' },
      );
      if (res.status === 0 && res.stdout.trim()) {
        branchName = res.stdout.trim();
      }
    } catch (_e) {
      // Fallback to identifier if gh is missing or fails
    }
  }

  const sBranch = sanitizeName(branchName);
  const sId = sanitizeName(prId);
  const sSuffix = suffix ? `-${sanitizeName(suffix)}` : '';

  return {
    branchName,
    // Containers are specific to the branch, action, and optional suffix
    containerName: `orbit-${sId}${sSuffix}-${action}`,
    // Sessions are specific to the branch and suffix
    sessionName: `orbit-${sBranch}${sSuffix}`,
    // Workspaces are specific to the branch, action, and suffix
    workspaceName: `mission-${sId}${sSuffix}-${action}`,
  };
}

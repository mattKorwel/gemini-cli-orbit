/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import { sanitizeName, detectRepoName } from '../core/ConfigManager.js';

export interface MissionContext {
  branchName: string;
  containerName: string;
  sessionName: string;
  workspaceName: string;
}

/**
 * Resolves PR/Issue metadata and calculates standardized mission names.
 */
export function resolveMissionContext(
  identifier: string,
  action: string,
  repoName?: string,
): MissionContext {
  const parts = identifier.split(':');
  const prId = parts[0]!;
  const suffix = parts.length > 1 ? parts.slice(1).join('-') : undefined;

  let branchName = prId;

  // Try to resolve PR branch name via GH CLI if identifier is numeric
  if (/^\d+$/.test(prId)) {
    try {
      const res = spawnSync(
        'gh',
        ['pr', 'view', prId, '--json', 'headRefName'],
        {
          encoding: 'utf8',
          stdio: 'pipe',
        },
      );
      if (res.status === 0 && res.stdout.trim()) {
        const data = JSON.parse(res.stdout);
        branchName = data.headRefName;
      }
    } catch (_e) {
      // Fallback
    }
  }

  const sBranch = sanitizeName(branchName);
  const sId = sanitizeName(prId);
  const sSuffix = suffix ? `-${sanitizeName(suffix)}` : '';
  const sRepo = sanitizeName(repoName || detectRepoName() || 'unknown');

  // Unified Starfleet Naming:
  // Display: orbit/repo/id
  // Slug:    orbit-repo-id
  const displayName = `orbit/${sRepo}/${sId}${sSuffix}`;
  const slugName = `orbit-${sRepo}-${sId}${sSuffix}`;

  // For backward compatibility, the container name for playbooks still includes the action
  const containerName = action === 'chat' ? slugName : `${slugName}-${action}`;
  const sessionName =
    action === 'chat' ? displayName : `${displayName}/${action}`;

  return {
    branchName: sBranch,
    containerName,
    sessionName,
    workspaceName: `orbit-${sId}${sSuffix}`,
  };
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import { sanitizeName } from '../core/ConfigManager.js';
import { MISSION_PREFIX } from '../core/Constants.js';

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

  // Unified Starfleet Naming: orbit-<identifier>-<action>
  const fullName = `${MISSION_PREFIX}${sId}${sSuffix}-${action}`;

  return {
    branchName: sBranch,
    containerName: fullName,
    sessionName: fullName,
    workspaceName: fullName,
  };
}

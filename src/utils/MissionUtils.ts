/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import { sanitizeName } from '../core/ConfigManager.js';
import { MISSION_PREFIX as _MISSION_PREFIX } from '../core/Constants.js';
import { type MissionManifest } from '../core/types.js';

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

  // Starfleet Simplified Naming Strategy
  // 1. Slug is JUST the sanitized ID + suffix (No redundant orbit- prefix unless needed for isolation)
  // 2. We add the orbit- prefix back for the "Container Name" (Docker/Worktree folder) for isolation.

  const slug = `${sId}${sSuffix}`;
  const workspaceName = `orbit-${slug}`;

  // containerName is the unique mission ID used for attaching.
  const containerName =
    action === 'chat' ? workspaceName : `${workspaceName}-${action}`;
  const sessionName = containerName;

  return {
    branchName: sBranch,
    containerName,
    sessionName,
    workspaceName,
  };
}

/**
 * Serializes a manifest for environment injection.
 */
export function serializeManifest(manifest: MissionManifest): string {
  return JSON.stringify(manifest);
}

/**
 * Retrieves and parses the mission manifest from the environment.
 */
export function getManifestFromEnv(): MissionManifest {
  const raw = process.env.GCLI_ORBIT_MANIFEST;
  if (!raw) {
    throw new Error('❌ Missing GCLI_ORBIT_MANIFEST environment variable.');
  }
  try {
    return JSON.parse(raw) as MissionManifest;
  } catch (e: any) {
    throw new Error(`❌ Failed to parse mission manifest: ${e.message}`, {
      cause: e,
    });
  }
}

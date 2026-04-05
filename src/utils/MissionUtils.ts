/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import { sanitizeName } from '../core/ConfigManager.js';
import { type MissionManifest } from '../core/types.js';

export interface MissionContext {
  branchName: string;
  repoSlug: string;
  idSlug: string;
  workspaceName: string;
  containerName: string;
  sessionName: string;
}

/**
 * Resolves PR/Issue metadata and extracts raw naming components.
 * This is the PURE METADATA source for Orbit missions.
 */
export function resolveMissionContext(
  identifier: string,
  repoName: string,
): { branchName: string; repoSlug: string; idSlug: string } {
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

  // Total Preservation: No pruning or prefixing here.
  const repoSlug = sanitizeName(repoName);
  const idSlug = `${sId}${sSuffix}`;

  return {
    branchName: sBranch,
    repoSlug,
    idSlug,
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
    const parsed = JSON.parse(raw);
    return parsed as MissionManifest;
  } catch (e: any) {
    throw new Error(`❌ Failed to parse mission manifest: ${e.message}`, {
      cause: e,
    });
  }
}

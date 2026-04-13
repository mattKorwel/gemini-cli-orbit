/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { sanitizeName } from '../core/ConfigManager.js';
import { type MissionManifest } from '../core/types.js';
import {
  type IProcessManager,
  type IProcessResult,
} from '../core/interfaces.js';
import {
  CAPSULE_MANIFEST_PATH,
  LOCAL_MANIFEST_ENV,
  LOCAL_MANIFEST_NAME,
} from '../core/Constants.js';

export interface MissionContext {
  branchName: string;
  repoSlug: string;
  idSlug: string;
  action: string;
  workspaceName: string;
  containerName: string;
  sessionName: string;
  upstreamUrl?: string | undefined;
}

/**
 * Resolves mission context (slugs and names) based on identifier.
 */
export function resolveMissionContext(
  identifier: string,
  repoName: string,
  pm: IProcessManager,
): MissionContext {
  const repoSlug = sanitizeName(repoName);

  // 1. Resolve branch name if identifier is numeric
  const parts = identifier.split(':');
  const idPart = parts[0] || 'mission';
  const actionPart = parts[1];

  let branchName = idPart;
  // Explicit shorthand like "123:review" is already fully hydrated input.
  // Avoid a GH lookup here so resolution remains deterministic and offline-safe.
  if (/^\d+$/.test(idPart) && !actionPart) {
    const res: IProcessResult = pm.runSync('gh', [
      'pr',
      'view',
      idPart,
      '--json',
      'headRefName',
      '--template',
      '{{.headRefName}}',
    ]);
    if (res.status === 0) {
      branchName = res.stdout.toString().trim();
    }
  }

  // 2. Handle id:action suffix (e.g. 123:review)
  const action = actionPart || 'chat';
  const idSlug = sanitizeName(idPart || 'mission');

  return {
    branchName,
    repoSlug,
    idSlug,
    action,
    workspaceName: path.join(repoSlug, idSlug),
    containerName:
      action === 'chat'
        ? `${repoSlug}-${idSlug}`
        : `${repoSlug}-${idSlug}-${action}`,
    sessionName:
      action === 'chat'
        ? `${repoSlug}/${idSlug}`
        : `${repoSlug}/${idSlug}/${action}`,
  };
}

/**
 * Unified loader for Mission Manifests.
 * Prioritizes global capsule manifest, then local worktree manifest.
 */
export function getMissionManifest(): MissionManifest {
  // 1. Try explicit manifest path from environment (local worktree)
  const explicitManifest = process.env[LOCAL_MANIFEST_ENV];
  if (explicitManifest && fs.existsSync(explicitManifest)) {
    try {
      return JSON.parse(fs.readFileSync(explicitManifest, 'utf8'));
    } catch (e: any) {
      throw new Error(`❌ Failed to parse explicit manifest: ${e.message}`, {
        cause: e,
      });
    }
  }

  // 2. Try global capsule manifest (/orbit/manifest.json)
  // ADR 0018: This is the primary manifest location for Agent Capsules
  if (fs.existsSync(CAPSULE_MANIFEST_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CAPSULE_MANIFEST_PATH, 'utf8'));
    } catch (e: any) {
      throw new Error(`❌ Failed to parse capsule manifest: ${e.message}`, {
        cause: e,
      });
    }
  }

  // 3. Try RAM-disk manifest (Starfleet Fast-Path injection)
  // When running via Starfleet, the SDK may inject it here.
  const shmManifests = fs.existsSync('/dev/shm')
    ? fs.readdirSync('/dev/shm').filter((f) => f.includes('orbit-manifest'))
    : [];

  if (shmManifests.length > 0) {
    // Pick the most recent if multiple (rare)
    const latest = shmManifests.sort().reverse()[0];
    if (latest) {
      const shmPath = path.join('/dev/shm', latest);
      try {
        return JSON.parse(fs.readFileSync(shmPath, 'utf8'));
      } catch (_e: any) {
        // Continue to next fallback
      }
    }
  }

  // 4. Try legacy local worktree manifest (./.orbit-manifest.json)
  // Fallback for local development or manual worker testing
  const localManifest = path.resolve(process.cwd(), LOCAL_MANIFEST_NAME);
  if (fs.existsSync(localManifest)) {
    try {
      return JSON.parse(fs.readFileSync(localManifest, 'utf8'));
    } catch (e: any) {
      throw new Error(`❌ Failed to parse local manifest: ${e.message}`, {
        cause: e,
      });
    }
  }

  throw new Error(
    `❌ Mission manifest not found. Looked in ${explicitManifest || `$${LOCAL_MANIFEST_ENV}`}, ${CAPSULE_MANIFEST_PATH} and ${localManifest}`,
  );
}

/**
 * @deprecated Use getMissionManifest() instead
 */
export function getManifestFromEnv(): MissionManifest {
  return getMissionManifest();
}

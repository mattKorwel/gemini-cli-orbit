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
  if (/^\d+$/.test(idPart)) {
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
 * Prioritizes local worktree manifest, then global capsule manifest.
 */
export function getMissionManifest(): MissionManifest {
  // 1. Try global capsule manifest (/home/node/.orbit-manifest.json)
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

  // 2. Try local worktree manifest (./.orbit-manifest.json)
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
    `❌ Mission manifest not found. Looked in ${CAPSULE_MANIFEST_PATH} and ${localManifest}`,
  );
}

/**
 * @deprecated Use getMissionManifest() instead
 */
export function getManifestFromEnv(): MissionManifest {
  return getMissionManifest();
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { type IGitExecutor } from '../core/interfaces.js';
import { type StationSupervisorConfig } from '../core/types.js';
import { buildMountAreas, resolveHostPathFromAreas } from './MountRegistry.js';

export interface WorkspaceOptions {
  workDir: string;
  upstreamUrl: string;
  branchName: string;
  mirrorPath?: string;
}

/**
 * WorkspaceManager: Manages Git repositories on the Station host.
 */
export class WorkspaceManager {
  private readonly mountAreas;

  constructor(
    private readonly git: IGitExecutor,
    private readonly config: StationSupervisorConfig,
  ) {
    this.mountAreas = buildMountAreas(config.mounts, config.areas);
  }

  private resolveSupervisorPath(targetPath: string): string {
    if (/^[A-Z]:/i.test(targetPath) || !targetPath.startsWith('/')) {
      return targetPath;
    }

    const mappedPath = resolveHostPathFromAreas(targetPath, this.mountAreas);
    if (process.platform === 'win32' && mappedPath) {
      return mappedPath;
    }

    const normalized = targetPath.replace(/\\/g, '/');
    let cursor = normalized;

    while (true) {
      if (fs.existsSync(cursor) && cursor !== '/') {
        return targetPath;
      }
      const next = path.posix.dirname(cursor);
      if (next === cursor) {
        break;
      }
      cursor = next;
    }

    if (mappedPath && this.config.isUnlocked) {
      return mappedPath;
    }

    if (mappedPath) {
      throw new Error(
        `Supervisor path "${normalized}" is not available inside the supervisor. Check static mounts.`,
      );
    }

    return targetPath;
  }

  /**
   * Ensures a workspace exists, is initialized, and is on the correct branch.
   */
  async ensureWorkspace(options: WorkspaceOptions): Promise<void> {
    const {
      workDir,
      upstreamUrl,
      branchName,
      mirrorPath: manifestMirror,
    } = options;
    const targetDir = this.resolveSupervisorPath(workDir);

    const mirrorPath = manifestMirror || this.config.storage.mirrorPath;

    if (process.env.GCLI_ORBIT_SKIP_GIT === '1') {
      if (!fs.existsSync(targetDir))
        fs.mkdirSync(targetDir, { recursive: true });
      return;
    }

    // 1. Check if it's already a git repo
    this.git.revParse(targetDir, ['--is-inside-work-tree'], {
      quiet: true,
    });
    const res = this.git.init(targetDir);

    // If init succeeded and we need to add remote/mirror
    if (res.status === 0) {
      // Setup remote
      this.git.remoteAdd(targetDir, 'origin', upstreamUrl);

      // Setup Alternates (Reference Clone) for speed
      let objectsPath = '';
      if (mirrorPath) {
        if (fs.existsSync(path.join(mirrorPath, 'config'))) {
          objectsPath = path.join(mirrorPath, 'objects');
        } else if (fs.existsSync(path.join(mirrorPath, '.git', 'config'))) {
          objectsPath = path.join(mirrorPath, '.git', 'objects');
        }
      }

      if (objectsPath) {
        const alternates = path.join(targetDir, '.git/objects/info/alternates');
        // Ensure the directory exists
        if (!fs.existsSync(path.dirname(alternates))) {
          fs.mkdirSync(path.dirname(alternates), { recursive: true });
        }
        fs.writeFileSync(alternates, objectsPath);
      }
    }

    // 2. Fetch and Checkout
    console.info(`[ORCH]    - Fetching branch '${branchName}' from origin...`);
    this.git.fetch(targetDir, 'origin', branchName);

    console.info(`[ORCH]    - Checking out branch '${branchName}'...`);
    this.git.checkout(targetDir, branchName);
  }
}

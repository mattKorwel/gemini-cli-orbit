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

    const hostRoot = this.config.hostRoot?.replace(/\\/g, '/');
    if (mappedPath && hostRoot && mappedPath.startsWith(hostRoot)) {
      const relative = mappedPath.slice(hostRoot.length).replace(/^\/+/, '');
      return relative ? `/orbit/data/${relative}` : '/orbit/data';
    }

    const manifestRoot = this.config.manifestRoot?.replace(/\\/g, '/');
    if (mappedPath && manifestRoot && mappedPath.startsWith(manifestRoot)) {
      return mappedPath;
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

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (process.env.GCLI_ORBIT_SKIP_GIT === '1') {
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
    const fetchRes = this.git.fetch(targetDir, 'origin', branchName, {
      quiet: true,
    });
    if (fetchRes.status !== 0) {
      console.warn(
        `   ⚠️  Branch '${branchName}' fetch failed or not found. Creating locally if needed.`,
      );
    }

    const localRef = `refs/heads/${branchName}`;
    const remoteRef = `refs/remotes/origin/${branchName}`;
    const localCheck = this.git.verify(targetDir, localRef, { quiet: true });
    const remoteCheck = this.git.verify(targetDir, remoteRef, { quiet: true });

    if (localCheck.status === 0) {
      console.info(`[ORCH]    - Checking out local branch '${branchName}'...`);
      const checkoutRes = this.git.checkout(targetDir, branchName, {
        quiet: true,
      });
      if (checkoutRes.status !== 0) {
        throw new Error(
          `Failed to checkout local branch '${branchName}': ${checkoutRes.stderr}`,
        );
      }
      return;
    }

    if (remoteCheck.status === 0) {
      console.info(
        `[ORCH]    - Creating branch '${branchName}' from origin/${branchName}...`,
      );
      const checkoutNewRes = this.git.checkoutNew(
        targetDir,
        branchName,
        `origin/${branchName}`,
        {
          quiet: true,
        },
      );
      if (checkoutNewRes.status !== 0) {
        throw new Error(
          `Failed to create branch '${branchName}' from origin/${branchName}: ${checkoutNewRes.stderr}`,
        );
      }
      return;
    }

    console.warn(
      `   ⚠️  Branch '${branchName}' not found. Creating from HEAD.`,
    );
    const checkoutNewRes = this.git.checkoutNew(
      targetDir,
      branchName,
      undefined,
      {
        quiet: true,
      },
    );
    if (checkoutNewRes.status !== 0) {
      throw new Error(
        `Failed to create branch '${branchName}' from HEAD: ${checkoutNewRes.stderr}`,
      );
    }
  }
}

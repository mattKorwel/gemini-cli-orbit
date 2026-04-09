/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { type IGitExecutor } from '../core/interfaces.js';
import { type StationSupervisorConfig } from '../core/types.js';

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
  constructor(
    private readonly git: IGitExecutor,
    private readonly config: StationSupervisorConfig,
  ) {}

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
    const targetDir = path.resolve(workDir);

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
      if (mirrorPath && fs.existsSync(path.join(mirrorPath, 'config'))) {
        const alternates = path.join(targetDir, '.git/objects/info/alternates');
        const objects = path.join(mirrorPath, 'objects');

        // Ensure the directory exists
        if (!fs.existsSync(path.dirname(alternates))) {
          fs.mkdirSync(path.dirname(alternates), { recursive: true });
        }

        fs.writeFileSync(alternates, objects);
      }
    }

    // 2. Fetch and Checkout
    console.info(`[ORCH]    - Fetching branch '${branchName}' from origin...`);
    this.git.fetch(targetDir, 'origin', branchName);

    console.info(`[ORCH]    - Checking out branch '${branchName}'...`);
    this.git.checkout(targetDir, branchName);
  }
}

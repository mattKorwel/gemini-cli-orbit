/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { type IGitExecutor } from '../core/interfaces.js';
import { GitExecutor } from '../core/executors/GitExecutor.js';

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
  constructor(private readonly git: IGitExecutor) {}

  /**
   * Ensures a workspace exists, is initialized, and is on the correct branch.
   */
  async ensureWorkspace(options: WorkspaceOptions): Promise<void> {
    const { workDir, upstreamUrl, branchName, mirrorPath } = options;
    const targetDir = path.resolve(workDir);

    // 1. Check if it's already a git repo
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
    this.git.fetch(targetDir, 'origin', branchName);
    this.git.checkout(targetDir, branchName);
  }
}

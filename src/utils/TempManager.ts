/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  type OrbitConfig,
  DEFAULT_TEMP_DIR,
  GLOBAL_TOKENS_DIR,
} from '../core/Constants.js';

/**
 * Manages session-isolated temporary directories for missions.
 */
export class TempManager {
  private readonly baseTempDir: string;
  private readonly autoClean: boolean;

  constructor(config: OrbitConfig) {
    // Resolve temp dir: Config > Environment > Default
    this.baseTempDir =
      config.tempDir || process.env.GCLI_ORBIT_TEMP_DIR || DEFAULT_TEMP_DIR;

    // Resolve autoClean: Config > Environment > Default (true)
    this.autoClean =
      config.autoClean !== undefined
        ? config.autoClean
        : process.env.GCLI_ORBIT_AUTO_CLEAN !== undefined
          ? process.env.GCLI_ORBIT_AUTO_CLEAN === 'true'
          : true;

    // Replace home tilde if present
    if (this.baseTempDir.startsWith('~')) {
      this.baseTempDir = path.join(os.homedir(), this.baseTempDir.slice(1));
    }
  }

  /**
   * Ensures and returns the session-specific temporary directory.
   */
  getDir(sessionId: string): string {
    const sessionDir = path.join(this.baseTempDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    return sessionDir;
  }

  /**
   * Cleans up the session directory if autoClean is enabled.
   */
  cleanup(sessionId: string): void {
    if (!this.autoClean) return;

    const sessionDir = path.join(this.baseTempDir, sessionId);
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (e) {
        console.error(`⚠️ Failed to clean up temp dir ${sessionDir}:`, e);
      }
    }
  }

  /**
   * Retrieves a stored GitHub token for a repository.
   */
  static getToken(repoName: string): string {
    const tokenPath = path.join(GLOBAL_TOKENS_DIR, repoName);
    if (fs.existsSync(tokenPath)) {
      return fs.readFileSync(tokenPath, 'utf8').trim();
    }
    return '';
  }
}

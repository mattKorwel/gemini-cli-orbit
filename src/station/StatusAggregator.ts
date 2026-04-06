/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ORBIT_STATE_PATH,
  SATELLITE_WORKSPACES_PATH,
} from '../core/Constants.js';

/**
 * Aggregates all mission state manifests on this station.
 */
export class StatusAggregator {
  constructor(
    private readonly workspacesRoot: string = SATELLITE_WORKSPACES_PATH,
  ) {}

  async getStatus() {
    const root = this.workspacesRoot;
    if (!fs.existsSync(root)) {
      return { missions: [] };
    }

    const reports: any[] = [];

    const scan = (dir: string) => {
      const stateFile = path.join(dir, ORBIT_STATE_PATH);
      if (fs.existsSync(stateFile)) {
        try {
          const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
          const rel = path.relative(root, dir);
          const parts = rel.split(path.sep);

          reports.push({
            repo: parts.length > 1 ? parts[0] : 'unknown',
            mission: parts[parts.length - 1],
            ...state,
          });
          return; // Don't scan inside a mission
        } catch (_e) {
          // Skip
        }
      }

      // Keep scanning subdirs (up to 2 levels deep)
      const rel = path.relative(root, dir);
      const depth = rel === '' ? 0 : rel.split(path.sep).length;
      if (depth >= 2) return;

      try {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          const full = path.join(dir, entry);
          if (fs.statSync(full).isDirectory()) {
            scan(full);
          }
        }
      } catch (_e) {}
    };

    scan(root);
    return { missions: reports };
  }
}

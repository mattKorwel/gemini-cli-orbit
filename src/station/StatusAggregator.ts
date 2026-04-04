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
  async getStatus() {
    const workspacesRoot = SATELLITE_WORKSPACES_PATH;
    if (!fs.existsSync(workspacesRoot)) {
      return { missions: [] };
    }

    const reports: any[] = [];
    const repos = fs.readdirSync(workspacesRoot);

    for (const repo of repos) {
      const repoPath = path.join(workspacesRoot, repo);
      try {
        if (!fs.statSync(repoPath).isDirectory()) continue;
      } catch (e) {
        continue;
      }

      const missions = fs.readdirSync(repoPath);
      for (const mission of missions) {
        const missionPath = path.join(repoPath, mission);
        try {
          if (!fs.statSync(missionPath).isDirectory()) continue;
        } catch (e) {
          continue;
        }

        const stateFile = path.join(missionPath, ORBIT_STATE_PATH);
        if (fs.existsSync(stateFile)) {
          try {
            const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
            reports.push({
              repo,
              mission,
              ...state,
            });
          } catch (e) {
            // Skip corrupted state files
          }
        }
      }
    }

    return { missions: reports };
  }
}

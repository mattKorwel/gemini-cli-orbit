/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { type MissionManifest } from '../core/types.js';
import { type WorkspaceManager } from './WorkspaceManager.js';
import { type DockerManager } from './DockerManager.js';
import { logger } from '../core/Logger.js';

export interface StarfleetReceipt {
  missionId: string;
  containerName: string;
  workspacePath: string;
  ignitedAt: string;
}

/**
 * MissionOrchestrator: The coordinator for Starfleet missions on the station.
 * Separates API routing from mission lifecycle logic.
 */
export class MissionOrchestrator {
  constructor(
    private readonly workspace: WorkspaceManager,
    private readonly docker: DockerManager,
  ) {}

  /**
   * Performs the full end-to-end orchestration for a new mission.
   */
  async orchestrate(manifest: MissionManifest): Promise<StarfleetReceipt> {
    const {
      identifier,
      workDir,
      upstreamUrl,
      branchName,
      mirrorPath,
      containerName,
    } = manifest;

    logger.info('ORCH', `🚀 Starting orchestration for ${identifier}...`);

    // 1. Prepare Workspace (Host-side Git)
    await this.workspace.ensureWorkspace({
      workDir,
      upstreamUrl,
      branchName,
      mirrorPath,
    });

    // 2. Write Manifest Receipt (Permission-Safe as node user)
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }
    const manifestPath = path.join(workDir, '.orbit-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    logger.info('ORCH', `   ✅ Manifest written to ${manifestPath}`);

    // 3. Launch Container (DooD)
    const image =
      (manifest as any).image || 'ghcr.io/mattkorwel/gemini-cli-orbit:latest';
    const bundlePath = '/mnt/disks/data/bin/mission.js';

    // Inject both standard and sensitive environment
    const fullEnv = {
      ...manifest.env,
      ...manifest.sensitiveEnv,
      GCLI_ORBIT_MISSION_ID: identifier,
      GCLI_ORBIT_ACTION: manifest.action,
    };

    await this.docker.runMissionContainer({
      id: identifier,
      image,
      workDir,
      env: fullEnv,
      command: `node ${bundlePath}`,
    });

    return {
      missionId: identifier,
      containerName,
      workspacePath: workDir,
      ignitedAt: new Date().toISOString(),
    };
  }
}

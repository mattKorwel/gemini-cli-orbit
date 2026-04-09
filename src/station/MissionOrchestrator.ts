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
import { type StationSupervisorConfig } from '../core/types.js';
import { ORBIT_STATE_PATH } from '../core/Constants.js';

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
    private readonly config: StationSupervisorConfig,
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

    console.info(`[ORCH] 🚀 Starting orchestration for ${identifier}...`);

    // 1. Path Translation (ADR 0020: Provider-Led Path Resolution)
    // If the path starts with the container root, we map it to the host root.
    // Otherwise, we assume it's already a valid host path (e.g. for local-docker).
    const CONTAINER_ROOT = '/mnt/disks/data';
    let hostWorkDir = workDir;

    if (workDir.startsWith(CONTAINER_ROOT)) {
      const relativeToRoot = path.relative(CONTAINER_ROOT, workDir);
      hostWorkDir = path.resolve(
        this.config.storage.workspacesRoot,
        '..',
        relativeToRoot,
      );
    }

    console.info(
      `[ORCH]    - Mapping container path ${workDir} -> host path ${hostWorkDir}`,
    );

    // 2. Prepare Workspace (Host-side Git)
    await this.workspace.ensureWorkspace({
      workDir: hostWorkDir,
      upstreamUrl,
      branchName,
      mirrorPath,
    } as any);

    // 3. Write Manifest Receipt (Isolated RAM-disk for container mount)
    if (!fs.existsSync(this.config.manifestRoot)) {
      fs.mkdirSync(this.config.manifestRoot, { recursive: true });
    }

    // ADR: The worker container must receive a manifest with CONTAINER paths, not host paths.
    const workerManifest = {
      ...manifest,
      workDir: workDir.startsWith(CONTAINER_ROOT)
        ? workDir
        : path.join(
            CONTAINER_ROOT,
            path.relative(this.config.storage.workspacesRoot, hostWorkDir),
          ),
    };

    const manifestPath = path.join(
      this.config.manifestRoot,
      `orbit-manifest-${identifier}.json`,
    );
    fs.writeFileSync(manifestPath, JSON.stringify(workerManifest, null, 2));
    console.info(`[ORCH]    ✅ Manifest written to ${manifestPath}`);

    // 4. Launch Container (DooD)
    const image = (manifest as any).image;

    const isDev = this.config.isUnlocked && manifest.isDev;
    console.info(
      `[ORCH]    🚀 Spawning container '${containerName}' (image=${image || 'default'}, isDev=${isDev})...`,
    );

    // Inject both standard and sensitive environment
    const fullEnv = {
      ...manifest.env,
      ...manifest.sensitiveEnv,
      GCLI_ORBIT_MISSION_ID: identifier,
      GCLI_ORBIT_ACTION: manifest.action,
      GCLI_ORBIT_SESSION_NAME: manifest.sessionName,
      GCLI_TRUST: '1',
    };

    try {
      // ADR: The worker container now uses a standardized entrypoint script
      // which handles tmux wrapping and persistence internally.
      const entrypoint = '/usr/local/bin/starfleet-entrypoint.sh';

      await this.docker.runMissionContainer({
        id: identifier,
        name: containerName,
        image,
        env: fullEnv,
        command: `${entrypoint} ${manifest.action}`,
        isDev,
      } as any);

      // 5. Ignition Verification: Wait for worker to signal READY/IDLE
      console.info(`[ORCH]    ⏳ Verifying ignition for ${identifier}...`);

      const statePath = path.join(hostWorkDir, ORBIT_STATE_PATH);
      console.info(`[ORCH]    (Watching state at: ${statePath})`);

      const startTime = Date.now();
      const timeout = 15000; // 15 seconds
      let isReady = false;

      while (Date.now() - startTime < timeout) {
        if (fs.existsSync(statePath)) {
          try {
            const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
            if (state.status === 'IDLE' || state.status === 'READY') {
              isReady = true;
              break;
            }
          } catch (_e) {
            // Wait for valid JSON
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (!isReady) {
        throw new Error(
          `Ignition verification timed out after 15s. Worker failed to signal READY at ${statePath}`,
        );
      }

      console.info(`[ORCH]    ✨ Ignition confirmed for ${identifier}.`);
    } catch (err: any) {
      console.error(`[ORCH] ❌ Launch Failure: ${err.message}`);
      throw err;
    }

    return {
      missionId: identifier,
      containerName,
      workspacePath: workDir,
      ignitedAt: new Date().toISOString(),
    };
  }
}

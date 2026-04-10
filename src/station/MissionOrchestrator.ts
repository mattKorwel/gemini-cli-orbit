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
import {
  ORBIT_STATE_PATH,
  CAPSULE_ROOT,
  CAPSULE_MANIFEST_PATH,
} from '../core/Constants.js';
import {
  buildMountAreas,
  normalizeCapsulePath,
  resolveHostPathFromAreas,
} from './MountRegistry.js';

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
  private readonly mountAreas;
  private static readonly workerSecretEnvPath = '/run/orbit/mission.env';

  constructor(
    private readonly workspace: WorkspaceManager,
    private readonly docker: DockerManager,
    private readonly config: StationSupervisorConfig,
  ) {
    this.mountAreas = buildMountAreas(config.mounts, config.areas);
  }

  /**
   * Translates an internal (container) path back to its host equivalent.
   * Required for DooD (Docker-out-of-Docker) volume mounts.
   */
  private toHostPath(internalPath: string): string {
    if (/^[A-Z]:/i.test(internalPath)) {
      return internalPath;
    }

    const mappedPath = resolveHostPathFromAreas(internalPath, this.mountAreas);
    if (mappedPath) {
      return mappedPath;
    }

    return internalPath;
  }

  private resolveRequiredArea(name: string) {
    const area = this.config.areas?.[name];
    if (!area) {
      throw new Error(
        `Missing required static area '${name}' in supervisor config`,
      );
    }
    return area;
  }

  private resolveSupervisorFsPath(internalPath: string): string {
    if (/^[A-Z]:/i.test(internalPath) || !internalPath.startsWith('/')) {
      return internalPath;
    }

    const normalizedPath = normalizeCapsulePath(internalPath);
    const mappedPath = this.toHostPath(normalizedPath);
    if (process.platform === 'win32' && mappedPath !== normalizedPath) {
      return mappedPath;
    }

    let cursor = normalizedPath;

    while (true) {
      if (fs.existsSync(cursor) && cursor !== '/') {
        return normalizedPath;
      }
      const next = path.posix.dirname(cursor);
      if (next === cursor) {
        break;
      }
      cursor = next;
    }

    if (mappedPath !== normalizedPath && this.config.isUnlocked) {
      return mappedPath;
    }

    if (mappedPath !== normalizedPath) {
      throw new Error(
        `Supervisor path "${normalizedPath}" is not available inside the supervisor. Check static mounts.`,
      );
    }

    return normalizedPath;
  }

  private createMissionSecretFile(
    uniqueContainerName: string,
    sensitiveEnv: Record<string, string> | undefined,
  ): string | undefined {
    if (!sensitiveEnv || Object.keys(sensitiveEnv).length === 0) {
      return undefined;
    }

    const internalSecretPath = normalizeCapsulePath(
      `/dev/shm/.orbit-env-${uniqueContainerName}`,
    );
    const envContent = Object.entries(sensitiveEnv)
      .map(([key, value]) => `export ${key}='${value.replace(/'/g, "'\\''")}'`)
      .join('\n');

    const supervisorSecretPath =
      this.resolveSupervisorFsPath(internalSecretPath);
    fs.mkdirSync(path.dirname(supervisorSecretPath), { recursive: true });
    fs.writeFileSync(supervisorSecretPath, `${envContent}\n`, { mode: 0o600 });
    return internalSecretPath;
  }

  private buildWorkerMounts(options: {
    internalWorkDir: string;
    hostWorkDir: string;
    internalManifestPath: string;
    internalSecretPath?: string | undefined;
  }): { host: string; capsule: string; readonly?: boolean }[] {
    const {
      internalWorkDir,
      hostWorkDir,
      internalManifestPath,
      internalSecretPath,
    } = options;
    const mounts: { host: string; capsule: string; readonly?: boolean }[] = [
      {
        host: hostWorkDir,
        capsule: internalWorkDir,
      },
      {
        host: this.toHostPath(internalManifestPath),
        capsule: CAPSULE_MANIFEST_PATH,
      },
    ];

    if (internalSecretPath) {
      mounts.push({
        host: this.toHostPath(internalSecretPath),
        capsule: MissionOrchestrator.workerSecretEnvPath,
        readonly: true,
      });
    }

    const namedAreas = [
      this.resolveRequiredArea('globalGemini'),
      this.resolveRequiredArea('policies'),
      this.resolveRequiredArea('bundle'),
    ];
    const ghConfigArea = this.config.areas?.ghConfig;
    if (ghConfigArea && fs.existsSync(ghConfigArea.capsule)) {
      namedAreas.push(ghConfigArea);
    }

    for (const area of namedAreas) {
      const mount: { host: string; capsule: string; readonly?: boolean } = {
        host: this.toHostPath(area.capsule),
        capsule: area.capsule,
      };
      if (
        area.readonly !== undefined &&
        area.capsule !== '/orbit/home/.gemini'
      ) {
        mount.readonly = area.readonly;
      }
      mounts.push(mount);
    }

    const entrypointArea = this.config.areas?.entrypoint;
    if (entrypointArea) {
      mounts.push({
        host: this.toHostPath(entrypointArea.capsule),
        capsule: '/usr/local/bin/starfleet-entrypoint.sh',
        readonly: true,
      });
    } else {
      console.info(
        '[ORCH]    - Entrypoint Translation: using worker image baked-in entrypoint',
      );
    }

    return mounts;
  }

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

    const uniqueContainerName = `${containerName}-${Date.now()}`;
    console.info(`[ORCH] 🚀 Starting orchestration for ${identifier}...`);
    console.info(`[ORCH]    - Unique Container: ${uniqueContainerName}`);

    // 1. Path Translation (ADR 0023: Unified Container Root)
    // internalWorkDir is for the SUPERVISOR/WORKER (Internal perspective)
    let internalWorkDir = workDir;

    if (!workDir.startsWith(CAPSULE_ROOT)) {
      // If CLI sent a host path, map it to our internal workspaces root
      const rel = path.relative(this.config.storage.workspacesRoot, workDir);
      internalWorkDir = `${CAPSULE_ROOT}/workspaces/${rel}`.replace(/\\/g, '/');
    }

    // hostWorkDir is for the DOCKER DAEMON (Host perspective)
    const hostWorkDir = this.toHostPath(internalWorkDir);

    console.info(
      `[ORCH]    - Mapping: ${internalWorkDir} (Internal) <-> ${hostWorkDir} (Host)`,
    );

    // 2. Prepare Workspace (Host-side Git)
    // Note: WorkspaceManager uses the internal paths because it runs in the container
    await this.workspace.ensureWorkspace({
      workDir: internalWorkDir,
      upstreamUrl,
      branchName,
      mirrorPath,
    } as any);

    // 3. Prepare Mission Manifest
    const manifestArea = this.config.areas?.manifests;
    const internalManifestDir = normalizeCapsulePath(
      manifestArea?.capsule || `${CAPSULE_ROOT}/manifests`,
    );
    const supervisorManifestDir =
      this.resolveSupervisorFsPath(internalManifestDir);
    if (!fs.existsSync(supervisorManifestDir)) {
      fs.mkdirSync(supervisorManifestDir, { recursive: true });
    }

    const internalManifestPath = `${internalManifestDir}/orbit-manifest-${identifier}-${Date.now()}.json`;

    const { sensitiveEnv: _sensitiveEnv, ...workerManifestBase } = manifest;
    const workerManifest = {
      ...workerManifestBase,
      workDir: internalWorkDir,
    };

    fs.writeFileSync(
      this.resolveSupervisorFsPath(internalManifestPath),
      JSON.stringify(workerManifest, null, 2),
    );
    console.info(`[ORCH]    ✅ Manifest written to ${internalManifestPath}`);
    const internalSecretPath = this.createMissionSecretFile(
      uniqueContainerName,
      manifest.sensitiveEnv,
    );
    if (internalSecretPath) {
      console.info(`[ORCH]    🔐 Secret env written to ${internalSecretPath}`);
    }

    // 4. Assemble Mounts (Blueprint + Mission Specific)
    // We map HOST sources to CONTAINER targets.
    const mounts = this.buildWorkerMounts({
      internalWorkDir,
      hostWorkDir,
      internalManifestPath,
      internalSecretPath,
    });

    mounts.forEach((mount) => {
      console.info(
        `[ORCH]    - Worker Mount: ${mount.host} -> ${mount.capsule}${mount.readonly ? ' (ro)' : ''}`,
      );
    });

    const image = (manifest as any).image;
    const user = this.config.workerUser;
    const isDev = this.config.isUnlocked && manifest.isDev;

    const fullEnv = {
      ...manifest.env,
      HOME: '/orbit/home',
      GCLI_ORBIT_MISSION_ID: identifier,
      GCLI_ORBIT_ACTION: manifest.action,
      GCLI_ORBIT_SESSION_NAME: manifest.sessionName,
      GCLI_TRUST: '1',
    };

    try {
      const entrypoint = '/usr/local/bin/starfleet-entrypoint.sh';

      await this.docker.runMissionContainer({
        id: identifier,
        name: uniqueContainerName,
        image,
        user,
        env: fullEnv,
        mounts,
        command: `${entrypoint} ${manifest.action}`,
        isDev,
      } as any);

      // 6. Ignition Verification: Wait for worker to signal READY/IDLE
      console.info(`[ORCH]    ⏳ Verifying ignition for ${identifier}...`);

      const statePath = path.posix.join(internalWorkDir, ORBIT_STATE_PATH);
      const observableStatePath = this.resolveSupervisorFsPath(statePath);
      console.info(`[ORCH]    (Watching internal state at: ${statePath})`);
      const timeout = 15000;
      const startTime = Date.now();
      let ignited = false;
      while (Date.now() - startTime < timeout) {
        if (fs.existsSync(observableStatePath)) {
          try {
            const state = JSON.parse(
              fs.readFileSync(observableStatePath, 'utf8'),
            );
            if (state.status === 'IDLE' || state.status === 'READY') {
              ignited = true;
              break;
            }
          } catch (_e) {
            // Wait for valid JSON
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (!ignited) {
        throw new Error(
          `Ignition verification timed out after ${timeout / 1000}s. Worker failed to signal READY at ${statePath}`,
        );
      }

      console.info(`[ORCH]    ✨ Ignition confirmed for ${identifier}.`);
    } catch (err: any) {
      console.error(`[ORCH] ❌ Launch Failure: ${err.message}`);
      throw err;
    }

    return {
      missionId: identifier,
      containerName: uniqueContainerName,
      workspacePath: internalWorkDir,
      ignitedAt: new Date().toISOString(),
    };
  }
}

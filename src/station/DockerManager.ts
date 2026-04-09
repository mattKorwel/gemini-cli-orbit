/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import {
  type IDockerExecutor,
  type IProcessManager,
} from '../core/interfaces.js';
import { type StationSupervisorConfig } from '../core/types.js';

export interface MissionContainerOptions {
  id: string;
  name: string;
  image?: string;
  env?: Record<string, string>;
  command?: string;
  isDev?: boolean;
}

/**
 * DockerManager: Handles the lifecycle of mission capsules.
 * Runs inside the Station Supervisor (DooD mode).
 */
export class DockerManager {
  constructor(
    private readonly docker: IDockerExecutor,
    private readonly pm: IProcessManager,
    private readonly config: StationSupervisorConfig,
  ) {}

  /**
   * Spawns a new mission capsule container.
   */
  async runMissionContainer(options: MissionContainerOptions): Promise<void> {
    const { id, name, image, env, isDev } = options;

    const containerName = name;

    // 1. Blueprint-Driven Mounts (ADR 0015)
    const mounts: any[] = [...this.config.mounts];

    // 2. Mission-Specific Dynamic Mounts
    mounts.push({
      host: path.join(this.config.manifestRoot, `orbit-manifest-${id}.json`),
      capsule: '/home/node/.orbit-manifest.json',
    });

    // Shadow Mode: Override the baked-in mission logic with the supervisor's synced bundle
    if (isDev) {
      mounts.push({
        host: path.join(this.config.storage.workspacesRoot, '..', 'bin'),
        capsule: this.config.bundlePath,
      });
    }

    // Use the provided image, or the hydrated default worker image
    const missionImage = image || this.config.workerImage;

    // ADR 0022: Idempotent Spawning
    // If a container with this name already exists (e.g. from a crashed session),
    // we must remove it first to avoid conflicts.
    const cleanupCmd = this.docker.remove(containerName);
    await this.pm.run(cleanupCmd.bin, cleanupCmd.args, {
      ...cleanupCmd.options,
      quiet: true,
    });

    const cmd = this.docker.run(missionImage, options.command, {
      name: containerName,
      mounts,
      env,
      label: 'orbit-mission',
      interactive: true, // Always enable for TTY support
    } as any);

    console.log(`[DOCKER] 🏃 Spawning mission container: ${containerName}`);

    const res = await this.pm.run(cmd.bin, cmd.args, cmd.options);
    if (res.status !== 0) {
      throw new Error(
        `Failed to start mission container: ${res.stdout} ${res.stderr}`,
      );
    }
  }

  /**
   * Stops and removes a mission capsule.
   */
  async stopMissionContainer(id: string): Promise<void> {
    const containerName = `orbit-${id}`;

    const stopCmd = this.docker.stop(containerName);
    await this.pm.run(stopCmd.bin, stopCmd.args, stopCmd.options);

    const rmCmd = this.docker.remove(containerName);
    await this.pm.run(rmCmd.bin, rmCmd.args, rmCmd.options);
  }
}

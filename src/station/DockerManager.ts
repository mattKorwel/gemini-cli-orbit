/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type IDockerExecutor,
  type IProcessManager,
} from '../core/interfaces.js';
import { type StationSupervisorConfig } from '../core/types.js';

export interface MissionContainerOptions {
  id: string;
  name: string;
  image?: string;
  user?: string;
  env?: Record<string, string>;
  mounts?: { host: string; capsule: string; readonly?: boolean }[];
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
    const { name, image, user, env, mounts, isDev } = options;

    const containerName = name;

    // Use the provided image, or the hydrated default worker image
    const missionImage = image || this.config.workerImage;

    // ADR 0022: Idempotent Spawning
    const cleanupCmd = this.docker.remove(containerName);
    await this.pm.run(cleanupCmd.bin, cleanupCmd.args, {
      ...cleanupCmd.options,
      quiet: true,
    });

    const finalMounts = [...(mounts || this.config.mounts)];

    // Shadow Mode: Override the baked-in mission logic with the supervisor's live bundle
    if (isDev) {
      const bundleAreaHost = this.config.areas?.bundle?.host;
      const bundleHost = bundleAreaHost || this.config.bundlePath;
      if (
        bundleHost &&
        !finalMounts.find((mount) => mount.capsule === '/orbit/bundle')
      ) {
        finalMounts.push({
          host: bundleHost,
          capsule: '/orbit/bundle',
          readonly: true,
        });
      }
    }

    const cmd = this.docker.run(missionImage, options.command, {
      name: containerName,
      user,
      mounts: finalMounts,
      env: {
        ...env,
        GCLI_TRUST: '1',
      },
      label: 'orbit-mission',
      interactive: true,
    } as any);

    console.info(
      `[DOCKER] 🏃 Running Command: ${cmd.bin} ${cmd.args.join(' ')}`,
    );
    console.info(`[DOCKER]    - Options: ${JSON.stringify(cmd.options)}`);

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

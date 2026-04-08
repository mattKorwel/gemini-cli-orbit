/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type IDockerExecutor,
  type IProcessManager,
} from '../core/interfaces.js';

export interface MissionContainerOptions {
  id: string;
  image: string;
  workDir: string;
  env?: Record<string, string>;
  command?: string;
}

/**
 * DockerManager: Handles the lifecycle of mission capsules.
 * Runs inside the Station Supervisor (DooD mode).
 */
export class DockerManager {
  constructor(
    private readonly docker: IDockerExecutor,
    private readonly pm: IProcessManager,
  ) {}

  /**
   * Spawns a new mission capsule container.
   */
  async runMissionContainer(options: MissionContainerOptions): Promise<void> {
    const { id, image, workDir, env } = options;

    const containerName = `orbit-${id}`;

    // Standardize mounts:
    // We only mount the universal data disk.
    // All application logic (bundle) is expected to be on that disk.
    const mounts = [
      {
        host: '/mnt/disks/data',
        capsule: '/mnt/disks/data',
      },
    ];

    // Use the clean base image for the mission, NOT the fat supervisor image
    const missionImage =
      image ||
      'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';

    const cmd = this.docker.run(missionImage, options.command, {
      name: containerName,
      mounts,
      env,
      label: 'orbit-mission',
    });

    const res = await this.pm.run(cmd.bin, cmd.args, cmd.options);
    if (res.status !== 0) {
      throw new Error(`Failed to start mission container: ${res.stderr}`);
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

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
  ) {}

  /**
   * Spawns a new mission capsule container.
   */
  async runMissionContainer(options: MissionContainerOptions): Promise<void> {
    const { id, image, workDir, env, isDev } = options;

    const containerName = `orbit-${id}`;

    // Standardize mounts:
    // We only mount the workspace and the minimal mission worker logic.
    // We do NOT mount the Docker socket or the full Orbit bundle here.
    const mounts = [
      {
        host: workDir,
        capsule: workDir, // Symmetric path
      },

      // Inject only the minimal mission logic needed for the capsule to report state
      {
        host: '/usr/local/lib/orbit/bundle/mission.js',
        capsule: '/usr/local/bin/orbit-mission',
      },
      {
        host: '/usr/local/lib/orbit/bundle/hooks.js',
        capsule: '/usr/local/lib/orbit/hooks.js',
      },
    ];

    // If in Shadow Mode, bind-mount the local bundle override as the mission entrypoint
    if (isDev) {
      mounts.push({
        host: '/home/node/data/dev/shadow-bundle.js',
        capsule: '/usr/local/bin/orbit-mission',
      });
    }

    // Use the clean base image for the mission, NOT the fat supervisor image
    const missionImage =
      image ||
      'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';

    const cmd = this.docker.run(
      missionImage,
      'node /usr/local/bin/orbit-mission',
      {
        name: containerName,
        mounts,
        env,
        label: 'orbit-mission',
      },
    );

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

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalWorktreeProvider } from './LocalWorktreeProvider.js';
import { GceStarfleetProvider } from './GceStarfleetProvider.js';
import { LocalDockerStarfleetProvider } from './LocalDockerStarfleetProvider.js';
import { StarfleetClient } from '../sdk/StarfleetClient.js';
import type { OrbitProvider } from './BaseProvider.js';
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';
import { SshTransport } from '../transports/ssh/SshTransport.js';
import { IdentityTransport } from '../transports/IdentityTransport.js';
import {
  getPrimaryRepoRoot,
  type InfrastructureSpec,
  type ProjectContext,
} from '../core/Constants.js';
import path from 'node:path';
import fs from 'node:fs';
import {
  type IProviderFactory,
  type IProcessManager,
  type IExecutors,
} from '../core/interfaces.js';
import { GitExecutor } from '../core/executors/GitExecutor.js';
import { DockerExecutor } from '../core/executors/DockerExecutor.js';
import { TmuxExecutor } from '../core/executors/TmuxExecutor.js';
import { WindowsTmuxExecutor } from '../core/executors/WindowsTmuxExecutor.js';
import { NodeExecutor } from '../core/executors/NodeExecutor.js';
import { GeminiExecutor } from '../core/executors/GeminiExecutor.js';
import { SshExecutor } from '../core/executors/ssh/SshExecutor.js';
import { WindowsSshExecutor } from '../core/executors/ssh/WindowsSshExecutor.js';
import { WindowsSshTransport } from '../transports/ssh/WindowsSshTransport.js';

export class ProviderFactory implements IProviderFactory {
  constructor(
    private readonly pm: IProcessManager,
    private readonly executors: IExecutors,
  ) {}

  static getExecutors(pm: IProcessManager): IExecutors {
    const tmux =
      process.platform === 'win32'
        ? new WindowsTmuxExecutor(pm)
        : new TmuxExecutor(pm);

    return {
      git: new GitExecutor(pm),
      docker: new DockerExecutor(pm),
      tmux,
      node: new NodeExecutor(pm),
      gemini: new GeminiExecutor(pm),
      ssh:
        process.platform === 'win32'
          ? new WindowsSshExecutor(pm)
          : new SshExecutor(pm),
    };
  }

  getProvider(
    projectCtx: ProjectContext,
    infra: InfrastructureSpec,
    state?: InfrastructureState,
  ): OrbitProvider {
    // 1. High-Level Provider Mapping (ADR 0022: Simplified Orbit Buckets)
    const providerType = infra.providerType || 'local-worktree';
    const stationName = infra.stationName || `station-${projectCtx.repoName}`;

    // TIER A: Local Git (Legacy Worktrees)
    if (providerType === 'local-worktree') {
      return new LocalWorktreeProvider(
        projectCtx,
        fs,
        this.pm,
        this.executors,
        infra.workspacesDir ||
          path.resolve(
            getPrimaryRepoRoot(projectCtx.repoRoot),
            '..',
            'orbit-git-worktrees',
          ),
        infra,
      );
    }

    // TIER B: Local Docker (Starfleet on Mac)
    if (providerType === 'local-docker') {
      const transport = new IdentityTransport(this.pm);
      const client = new StarfleetClient(
        (infra as any).apiUrl || 'http://localhost:8080',
      );

      return new LocalDockerStarfleetProvider(
        client,
        transport,
        this.pm,
        this.executors,
        projectCtx,
        infra,
        {
          projectId: 'local',
          zone: 'localhost',
          stationName: infra.instanceName || stationName,
        },
      );
    }

    // TIER C: GCE (Starfleet)
    if (providerType === 'gce') {
      const transport =
        process.platform === 'win32'
          ? new WindowsSshTransport(
              infra.projectId!,
              infra.zone!,
              infra.instanceName!,
              infra,
              this.pm,
              this.executors.ssh,
            )
          : new SshTransport(
              infra.projectId!,
              infra.zone!,
              infra.instanceName!,
              infra,
              this.pm,
              this.executors.ssh,
            );

      const client = new StarfleetClient(
        (infra as any).apiUrl || 'http://localhost:8080',
      );

      const provider = new GceStarfleetProvider(
        client,
        transport,
        this.pm,
        this.executors,
        projectCtx,
        infra,
        {
          projectId: infra.projectId!,
          zone: infra.zone!,
          stationName: infra.instanceName || stationName,
        },
      );

      if (state && provider.injectState) {
        provider.injectState(state);
      }

      return provider;
    }

    throw new Error(`Unknown provider type: ${providerType}`);
  }
}

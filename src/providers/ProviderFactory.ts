/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GceCosProvider } from './GceCosProvider.js';
import { LocalWorktreeProvider } from './LocalWorktreeProvider.js';
import { StarfleetProvider } from './StarfleetProvider.js';
import { StarfleetClient } from '../sdk/StarfleetClient.js';
import type { OrbitProvider } from './BaseProvider.js';
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';
import { GceSSHManager } from './SSHManager.js';
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
import { NodeExecutor } from '../core/executors/NodeExecutor.js';
import { GeminiExecutor } from '../core/executors/GeminiExecutor.js';
import { SshExecutor } from '../core/executors/SshExecutor.js';

export class ProviderFactory implements IProviderFactory {
  constructor(
    private readonly pm: IProcessManager,
    private readonly executors: IExecutors,
  ) {}

  static getExecutors(pm: IProcessManager): IExecutors {
    return {
      git: new GitExecutor(pm),
      docker: new DockerExecutor(pm),
      tmux: new TmuxExecutor(pm),
      node: new NodeExecutor(pm),
      gemini: new GeminiExecutor(pm),
      ssh: new SshExecutor(pm),
    };
  }

  getProvider(
    projectCtx: ProjectContext,
    infra: InfrastructureSpec,
    state?: InfrastructureState,
  ): OrbitProvider {
    const isLocal =
      !infra.projectId ||
      infra.projectId === 'local' ||
      infra.providerType === 'local-worktree';
    const effectiveProvider =
      infra.providerType || (isLocal ? 'local-worktree' : 'gce');

    const stationName = infra.stationName || `station-${projectCtx.repoName}`;

    if (effectiveProvider === 'starfleet') {
      const client = new StarfleetClient(
        (infra as any).apiUrl || 'http://localhost:8080',
      );
      return new StarfleetProvider(client, this.pm, this.executors, {
        projectId: infra.projectId || 'starfleet',
        zone: infra.zone || 'starfleet',
        stationName: infra.instanceName || stationName,
      });
    }

    if (effectiveProvider === 'local-worktree') {
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

    // GCE flow: Initialize SSH Manager first
    const ssh = new GceSSHManager(
      infra.projectId!,
      infra.zone!,
      infra.instanceName!,
      infra,
      this.pm,
      this.executors.ssh,
    );

    const gceConfig: { imageUri?: string; stationName?: string } = {};
    if (infra.imageUri) gceConfig.imageUri = infra.imageUri;
    if (stationName) gceConfig.stationName = stationName;

    const provider = new GceCosProvider(
      projectCtx,
      infra.projectId!,
      infra.zone!,
      infra.instanceName!,
      getPrimaryRepoRoot(projectCtx.repoRoot),
      ssh,
      this.pm,
      this.executors,
      infra,
      gceConfig,
    );

    if (state && provider.injectState) {
      provider.injectState(state);
    }

    return provider;
  }
}

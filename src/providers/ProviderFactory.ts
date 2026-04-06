/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GceCosProvider } from './GceCosProvider.js';
import { LocalWorktreeProvider } from './LocalWorktreeProvider.js';
import type { OrbitProvider } from './BaseProvider.js';
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';
import { GceSSHManager } from './SSHManager.js';
import {
  getPrimaryRepoRoot,
  type InfrastructureSpec,
  type ProjectContext,
} from '../core/Constants.js';
import path from 'node:path';
import {
  type IProviderFactory,
  type IProcessManager,
  type IExecutors,
} from '../core/interfaces.js';

export class ProviderFactory implements IProviderFactory {
  constructor(
    private readonly pm: IProcessManager,
    private readonly executors: IExecutors,
  ) {}

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

    if (effectiveProvider === 'local-worktree') {
      return new LocalWorktreeProvider(
        projectCtx,
        this.pm,
        this.executors,
        stationName,
        infra.workspacesDir ||
          path.resolve(
            getPrimaryRepoRoot(projectCtx.repoRoot),
            '..',
            'orbit-git-worktrees',
          ),
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

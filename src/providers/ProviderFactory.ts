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

export class ProviderFactory {
  static getProvider(
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

    const stationName =
      infra.stationName || `orbit-station-${projectCtx.repoName}`;

    if (effectiveProvider === 'local-worktree') {
      const primaryRoot = getPrimaryRepoRoot(projectCtx.repoRoot);
      const localWorkspacesDir =
        infra.workspacesDir ||
        infra.worktreesDir ||
        path.resolve(primaryRoot, '..', 'workspaces');
      return new LocalWorktreeProvider(
        projectCtx,
        stationName,
        localWorkspacesDir,
      );
    }

    // GCE flow: Initialize SSH Manager first
    const ssh = new GceSSHManager(
      infra.projectId!,
      infra.zone!,
      infra.instanceName!,
      infra,
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
      gceConfig,
    );

    if (state && provider.injectState) {
      provider.injectState(state);
    }

    return provider;
  }
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GceCosProvider } from './GceCosProvider.js';
import { LocalWorktreeProvider } from './LocalWorktreeProvider.js';
import type { OrbitProvider } from './BaseProvider.js';
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';
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

    const gceConfig = {
      ...(infra.dnsSuffix !== undefined ? { dnsSuffix: infra.dnsSuffix } : {}),
      ...(infra.userSuffix !== undefined
        ? { userSuffix: infra.userSuffix }
        : {}),
      ...(infra.backendType !== undefined
        ? { backendType: infra.backendType as 'direct-internal' | 'external' }
        : {}),
      ...(infra.imageUri !== undefined ? { imageUri: infra.imageUri } : {}),
      ...(infra.vpcName !== undefined ? { vpcName: infra.vpcName } : {}),
      ...(infra.subnetName !== undefined
        ? { subnetName: infra.subnetName }
        : {}),
      ...(infra.machineType !== undefined
        ? { machineType: infra.machineType }
        : {}),
      ...(infra.reaperIdleLimit !== undefined
        ? { reaperIdleLimit: infra.reaperIdleLimit }
        : {}),
      stationName,
    };

    // Default to GCE
    const provider = new GceCosProvider(
      projectCtx,
      infra.projectId!,
      infra.zone!,
      infra.instanceName!,
      getPrimaryRepoRoot(projectCtx.repoRoot),
      gceConfig,
    );

    if (state && provider.injectState) {
      provider.injectState(state);
    }

    return provider;
  }
}

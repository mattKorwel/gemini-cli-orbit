/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GceCosProvider } from './GceCosProvider.js';
import { LocalWorktreeProvider } from './LocalWorktreeProvider.js';
import type { OrbitProvider } from './BaseProvider.js';
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';
import { getPrimaryRepoRoot } from '../core/Constants.js';
import path from 'node:path';

export class ProviderFactory {
  static getProvider(
    config: {
      projectId: string;
      zone: string;
      instanceName: string;
      repoName?: string | undefined;
      providerType?: string | undefined;
      dnsSuffix?: string | undefined;
      userSuffix?: string | undefined;
      backendType?: string | undefined;
      imageUri?: string | undefined;
      worktreesDir?: string | undefined;
      vpcName?: string | undefined;
      subnetName?: string | undefined;
      machineType?: string | undefined;
      reaperIdleLimit?: number | undefined;
    },
    state?: InfrastructureState,
  ): OrbitProvider {
    const isLocal =
      !config.projectId ||
      config.projectId === 'local' ||
      config.providerType === 'local-worktree';
    const effectiveProvider =
      config.providerType || (isLocal ? 'local-worktree' : 'gce');

    const stationName = config.repoName
      ? `gcli-station-${config.repoName}`
      : 'station-supervisor';

    if (effectiveProvider === 'local-worktree') {
      const primaryRoot = getPrimaryRepoRoot();
      const localWorktreesDir =
        config.worktreesDir || path.resolve(primaryRoot, '..', 'worktrees');
      return new LocalWorktreeProvider(stationName, localWorktreesDir);
    }

    const gceConfig = {
      ...(config.dnsSuffix !== undefined
        ? { dnsSuffix: config.dnsSuffix }
        : {}),
      ...(config.userSuffix !== undefined
        ? { userSuffix: config.userSuffix }
        : {}),
      ...(config.backendType !== undefined
        ? { backendType: config.backendType as 'direct-internal' | 'external' }
        : {}),
      ...(config.imageUri !== undefined ? { imageUri: config.imageUri } : {}),
      ...(config.vpcName !== undefined ? { vpcName: config.vpcName } : {}),
      ...(config.subnetName !== undefined
        ? { subnetName: config.subnetName }
        : {}),
      ...(config.machineType !== undefined
        ? { machineType: config.machineType }
        : {}),
      ...(config.reaperIdleLimit !== undefined
        ? { reaperIdleLimit: config.reaperIdleLimit }
        : {}),
      stationName,
    };

    // Default to GCE
    const provider = new GceCosProvider(
      config.projectId,
      config.zone,
      config.instanceName,
      getPrimaryRepoRoot(),
      gceConfig,
    );

    if (state && provider.injectState) {
      provider.injectState(state);
    }

    return provider;
  }
}

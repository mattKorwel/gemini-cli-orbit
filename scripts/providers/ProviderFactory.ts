/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GceCosProvider } from './GceCosProvider.js';
import { LocalWorktreeProvider } from './LocalWorktreeProvider.js';
import { LocalDockerProvider } from './LocalDockerProvider.js';
import type { OrbitProvider } from './BaseProvider.js';

const REPO_ROOT = process.cwd();

export class ProviderFactory {
  static getProvider(config: {
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
  }): OrbitProvider {
    const stationName = config.repoName ? `gcli-station-${config.repoName}` : 'station-supervisor';

    if (config.providerType === 'local-worktree') {
        return new LocalWorktreeProvider(stationName, config.worktreesDir);
    }

    if (config.providerType === 'local-docker' || config.providerType === 'podman') {
        return new LocalDockerProvider(stationName);
    }
    
    // Default to GCE
    return new GceCosProvider(
      config.projectId,
      config.zone,
      config.instanceName,
      REPO_ROOT,
      { 
        dnsSuffix: config.dnsSuffix, 
        userSuffix: config.userSuffix,
        backendType: config.backendType,
        imageUri: config.imageUri,
        vpcName: config.vpcName,
        subnetName: config.subnetName,
        machineType: config.machineType,
        stationName
      }
    );
  }
}

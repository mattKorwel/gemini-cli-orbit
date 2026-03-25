/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GceCosProvider } from './GceCosProvider.ts';
import type { WorkerProvider } from './BaseProvider.ts';




const REPO_ROOT = process.cwd();

export class ProviderFactory {
  static getProvider(config: {
    projectId: string;
    zone: string;
    instanceName: string;
    providerType?: string;
    dnsSuffix?: string;
    userSuffix?: string;
    backendType?: string;
  }): WorkerProvider {
    if (config.providerType === 'local-docker') {
        throw new Error('Local Docker provider not yet implemented.');
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
        backendType: config.backendType
      }
    );
  }
}

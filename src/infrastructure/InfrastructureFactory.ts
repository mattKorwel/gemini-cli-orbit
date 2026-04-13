/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InfrastructureProvisioner } from './InfrastructureProvisioner.js';
import { GcpCosTarget } from './targets/GcpCosTarget.js';
import { LocalNoopTarget } from './targets/LocalNoopTarget.js';
import type { OrbitConfig } from '../core/Constants.js';
import { type IInfrastructureFactory } from '../core/interfaces.js';

/**
 * Factory for creating InfrastructureProvisioner instances.
 */
export class InfrastructureFactory implements IInfrastructureFactory {
  /**
   * Returns a provisioner based on the schematic configuration.
   */
  getProvisioner(
    schematicName: string,
    config: OrbitConfig,
  ): InfrastructureProvisioner {
    const providerType = config.providerType || (config as any).type || 'gce';

    switch (providerType) {
      case 'gce':
        return new GcpCosTarget(schematicName, config);
      case 'local-docker':
      case 'local-git':
      case 'local-worktree':
      case 'local-workspace':
        return new LocalNoopTarget(schematicName);
      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }
  }
}

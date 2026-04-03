/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InfrastructureProvisioner } from './InfrastructureProvisioner.js';
import { GcpCosTarget } from './targets/GcpCosTarget.js';
import { LocalNoopTarget } from './targets/LocalNoopTarget.js';
import type { OrbitConfig } from '../core/Constants.js';

/**
 * Factory for creating InfrastructureProvisioner instances.
 */
export class InfrastructureFactory {
  /**
   * Returns a provisioner based on the schematic configuration.
   */
  static getProvisioner(
    schematicName: string,
    config: OrbitConfig,
  ): InfrastructureProvisioner {
    const providerType = config.providerType || 'gce';

    switch (providerType) {
      case 'gce':
        return new GcpCosTarget(schematicName, config);
      case 'local-workspace':
        return new LocalNoopTarget(schematicName);
      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }
  }
}

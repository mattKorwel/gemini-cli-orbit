/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InfrastructureState } from './InfrastructureState.js';

/**
 * Core interface for infrastructure lifecycle management.
 * Implementations (GCP, AWS, Local) use this to manage the physical/virtual station.
 */
export interface InfrastructureProvisioner {
  /** A unique identifier for this provisioner instance (usually derived from schematic name) */
  readonly id: string;

  /**
   * Provisions or updates the infrastructure to match the desired state.
   * Equivalent to 'pulumi up' or 'terraform apply'.
   */
  up(): Promise<InfrastructureState>;

  /**
   * Destroys the infrastructure.
   * Equivalent to 'pulumi destroy' or 'terraform destroy'.
   */
  down(): Promise<void>;

  /**
   * Refreshes the local state from the actual cloud provider resources.
   * Equivalent to 'pulumi refresh'.
   */
  refresh(): Promise<InfrastructureState>;

  /**
   * Returns the current known state of the infrastructure without performing updates.
   */
  getState(): Promise<InfrastructureState>;
}

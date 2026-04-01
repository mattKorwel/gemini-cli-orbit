/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Standardized state returned by an InfrastructureProvisioner.
 * This decoupled state is consumed by ExecutionProviders to establish connectivity.
 */
export interface InfrastructureState {
  /** Standardized status of the infrastructure lifecycle */
  status: 'provisioning' | 'ready' | 'error' | 'destroyed';

  /** The external/public IP address of the station (if available) */
  publicIp?: string;

  /** The internal/private IP address of the station */
  privateIp?: string;

  /** The unique cloud-provider identifier for the instance */
  instanceId?: string;

  /** The resolved SSH username for the instance (e.g., OS Login user) */
  sshUser?: string;

  /** Optional error message if status is 'error' */
  error?: string;

  /** Raw metadata from the provider (e.g., full Pulumi outputs) */
  metadata?: Record<string, any>;
}

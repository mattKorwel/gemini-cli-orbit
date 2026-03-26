/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ConnectivityStrategy {
  /**
   * Returns the connection target (e.g. user@hostname or instance-name).
   */
  getMagicRemote(): string;

  /**
   * Returns backend-specific SSH options.
   */
  getCommonArgs(): string[];

  /**
   * Returns the full shell command to execute a remote command.
   */
  getRunCommand(command: string, options: { interactive?: boolean }): string;

  /**
   * Sets an override host (e.g. after resolving IP).
   */
  setOverrideHost(host: string | null): void;

  /**
   * Returns the raw backend type.
   */
  getBackendType(): string;

  /**
   * Performs backend-specific network infrastructure setup (e.g. firewall rules).
   */
  setupNetworkInfrastructure(vpcName: string): void;

  /**
   * Returns the network-interface configuration string for instance creation.
   */
  getNetworkInterfaceConfig(vpcName: string, subnetName: string): string;

  /**
   * Hook called after successful instance creation.
   */
  onProvisioned(): Promise<void>;
}

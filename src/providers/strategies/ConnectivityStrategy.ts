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
   * Returns the full shell command string.
   */
  getRunCommand(
    command: string,
    options: { interactive?: boolean | undefined },
  ): string;

  /**
   * Returns the command as an array of arguments (safer for spawn).
   */
  getRunArgs(
    command: string,
    options: { interactive?: boolean | undefined },
  ): string[];

  /**
   * Sets an override host (e.g. after resolving IP).
   */
  setOverrideHost(host: string | null): void;

  /**
   * Returns the raw backend type.
   */
  getBackendType(): string;

  /**
   * Hook called after successful instance creation.
   */
  onProvisioned(): Promise<void>;
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OrbitProvider interface defines the contract for different remote
 * mission environments (GCE Station, Local Docker, etc.).
 */
export interface OrbitProvider {
  projectId: string;
  zone: string;
  stationName: string;

  /**
   * Provisions the underlying infrastructure station.
   */
  provision(options?: { setupNetwork?: boolean }): Promise<number>;

  /**
   * Ensures the station is running and accessible.
   */
  ensureReady(): Promise<number>;

  /**
   * Performs the initial setup of the station (SSH, scripts, auth).
   */
  setup(options: SetupOptions): Promise<number>;

  /**
   * Returns the raw command string that would be used to execute a command.
   */
  getRunCommand(command: string, options?: ExecOptions): string;

  /**
   * Executes a command on the station.
   */
  exec(command: string, options?: ExecOptions): Promise<number>;

  /**
   * Executes a command on the station and returns the output.
   */
  getExecOutput(
    command: string,
    options?: ExecOptions,
  ): Promise<{ status: number; stdout: string; stderr: string }>;

  /**
   * Synchronizes local files to the station.
   */
  sync(
    localPath: string,
    remotePath: string,
    options?: SyncOptions,
  ): Promise<number>;

  /**
   * Returns the status of the station.
   */
  getStatus(): Promise<OrbitStatus>;

  /**
   * Stops the station to save costs.
   */
  stop(): Promise<number>;

  /**
   * Returns the status of a specific capsule (container) in the station.
   */
  getCapsuleStatus(name: string): Promise<{ running: boolean; exists: boolean }>;

  /**
   * Runs a capsule (container) with specific configuration.
   */
  runCapsule(config: CapsuleConfig): Promise<number>;

  /**
   * Stops and removes a specific capsule.
   */
  removeCapsule(name: string): Promise<number>;

  /**
   * Captures the contents of the current tmux pane in a capsule.
   */
  capturePane(capsuleName: string): Promise<string>;

  /**
   * Lists all stations for the current user/project.
   */
  listStations(): Promise<number>;

  /**
   * Destroys the station and its associated resources.
   */
  destroy(): Promise<number>;

  /**
   * Lists active mission capsules.
   */
  listCapsules(): Promise<string[]>;
}

export interface SetupOptions {
  projectId: string;
  zone: string;
  dnsSuffix?: string;
  userSuffix?: string;
  backendType?: string;
}

export interface ExecOptions {
  interactive?: boolean;
  cwd?: string;
  wrapCapsule?: string;
  quiet?: boolean;
  env?: Record<string, string>;
  sensitiveEnv?: Record<string, string>;
}

export interface CapsuleConfig {
  name: string;
  image: string;
  mounts: { host: string; capsule: string; readonly?: boolean }[];
  env?: Record<string, string>;
  sensitiveEnv?: Record<string, string>;
  cpuLimit?: string;
  memoryLimit?: string;
  command?: string;
  user?: string;
}

export interface SyncOptions {
  delete?: boolean;
  exclude?: string[];
  sudo?: boolean;
}

export interface OrbitStatus {
  name: string;
  status: string;
  internalIp?: string;
  externalIp?: string;
}

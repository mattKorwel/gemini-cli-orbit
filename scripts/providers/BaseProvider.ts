/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WorkerProvider interface defines the contract for different remote
 * execution environments (GCE, Workstations, etc.).
 */
export interface WorkerProvider {
  /**
   * Provisions the underlying infrastructure.
   */
  provision(): Promise<number>;

  /**
   * Ensures the workspace is running and accessible.
   */
  ensureReady(): Promise<number>;

  /**
   * Performs the initial setup of the workspace (SSH, scripts, auth).
   */
  setup(options: SetupOptions): Promise<number>;

  /**
   * Returns the raw command string that would be used to execute a command.
   */
  getRunCommand(command: string, options?: ExecOptions): string;

  /**
   * Executes a command on the workspace.
   */
  exec(command: string, options?: ExecOptions): Promise<number>;

  /**
   * Executes a command on the workspace and returns the output.
   */
  getExecOutput(
    command: string,
    options?: ExecOptions,
  ): Promise<{ status: number; stdout: string; stderr: string }>;

  /**
   * Synchronizes local files to the workspace.
   */
  sync(
    localPath: string,
    remotePath: string,
    options?: SyncOptions,
  ): Promise<number>;

  /**
   * Returns the status of the workspace.
   */
  getStatus(): Promise<WorkspaceStatus>;

  /**
   * Stops the workspace to save costs.
   */
  stop(): Promise<number>;

  /**
   * Returns the status of a specific container in the workspace.
   */
  getContainerStatus(name: string): Promise<{ running: boolean; exists: boolean }>;

  /**
   * Runs a container with specific configuration.
   */
  runContainer(config: ContainerConfig): Promise<number>;

  /**
   * Stops and removes a specific container.
   */
  removeContainer(name: string): Promise<number>;

  /**
   * Captures the contents of the current tmux pane in a container.
   */
  capturePane(containerName: string): Promise<string>;
}

export interface SetupOptions {
  projectId: string;
  zone: string;
  dnsSuffix?: string;
  syncAuth?: boolean;
}

export interface ExecOptions {
  interactive?: boolean;
  cwd?: string;
  wrapContainer?: string;
  quiet?: boolean;
}

export interface ContainerConfig {
  name: string;
  image: string;
  mounts: { host: string; container: string; readonly?: boolean }[];
  env?: Record<string, string>;
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

export interface WorkspaceStatus {
  name: string;
  status: string;
  internalIp?: string;
  externalIp?: string;
}

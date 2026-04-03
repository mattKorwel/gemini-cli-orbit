/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type OrbitConfig, type ProjectContext } from './Constants.js';
import { logger, LogLevel } from './Logger.js';
import {
  type OrbitObserver,
  type MissionResult,
  type PulseInfo,
  type StationInfo,
  type CIStatus,
  type MissionOptions,
  type JettisonOptions,
  type ReapOptions,
  type AttachOptions,
  type GetLogsOptions,
  type ProvisionOptions,
  type ListStationsOptions,
  type DeleteStationOptions,
  type MonitorCIOptions,
  type SplashdownOptions,
  type IOrbitSDK,
} from './types.js';

import { MissionManager } from './MissionManager.js';
import { FleetManager } from './FleetManager.js';
import { StatusManager } from './StatusManager.js';
import { CIManager } from './CIManager.js';
import { IntegrationManager } from './IntegrationManager.js';
import { resolveContextBundles } from './ConfigManager.js';

export * from './types.js';

/**
 * Default observer that routes to the internal logger.
 */
export class DefaultObserver implements OrbitObserver {
  onLog(level: LogLevel, tag: string, message: string, ...args: any[]): void {
    if (level === LogLevel.ERROR) logger.error(tag, message, ...args);
    else if (level === LogLevel.WARN) logger.warn(tag, message, ...args);
    else if (level === LogLevel.DEBUG) logger.debug(tag, message, ...args);
    else logger.info(tag, message, ...args);
  }

  onProgress(phase: string, message: string): void {
    logger.info(phase, message);
  }

  onDivider(title?: string): void {
    logger.divider(title);
  }
}

/**
 * The Orbit SDK - Central functional core (Facade).
 * Delegating to specialized sub-managers for modularity.
 */
export class OrbitSDK implements IOrbitSDK {
  private readonly projectCtx: ProjectContext;
  private readonly missions: MissionManager;
  private readonly fleet: FleetManager;
  private readonly status: StatusManager;
  private readonly ci: CIManager;
  private readonly integrations: IntegrationManager;

  constructor(
    private readonly config: OrbitConfig,
    public readonly observer: OrbitObserver = new DefaultObserver(),
    repoRoot: string = process.cwd(),
  ) {
    const bundles = resolveContextBundles(repoRoot, config);
    this.projectCtx = bundles.project;

    // Ensure logger uses the correct repo root for its stream
    logger.setRepoRoot(this.projectCtx.repoRoot);

    this.missions = new MissionManager(
      this.projectCtx,
      bundles.infra,
      this.observer,
    );
    this.fleet = new FleetManager(
      this.projectCtx,
      bundles.infra,
      this.observer,
    );
    this.status = new StatusManager(this.projectCtx, bundles.infra);
    this.ci = new CIManager(this.projectCtx, bundles.infra, this.observer);
    this.integrations = new IntegrationManager(this.observer);
  }

  /**
   * Check station health and active mission status.
   */
  async getPulse(): Promise<PulseInfo> {
    return this.status.getPulse();
  }

  /**
   * Launch or resume an isolated developer presence.
   */
  async startMission(options: MissionOptions): Promise<MissionResult> {
    return this.missions.start(options);
  }

  /**
   * Decommission a specific mission and its worktree.
   */
  async jettisonMission(options: JettisonOptions): Promise<MissionResult> {
    return this.missions.jettison(options);
  }

  /**
   * Identify and remove idle mission capsules based on inactivity.
   */
  async reapMissions(options: ReapOptions = {}): Promise<number> {
    return this.missions.reap(options);
  }

  /**
   * Monitor CI status for a branch.
   */
  async monitorCI(options: MonitorCIOptions = {}): Promise<CIStatus> {
    return this.ci.monitor(options);
  }

  /**
   * Build or wake Orbital Station infrastructure.
   */
  async provisionStation(options: ProvisionOptions = {}): Promise<number> {
    return this.fleet.provision(options);
  }

  /**
   * Emergency shutdown of all active remote capsules.
   */
  async splashdown(options: SplashdownOptions = {}): Promise<number> {
    return this.fleet.splashdown(options);
  }

  /**
   * Attach to an active mission session.
   */
  async attach(options: AttachOptions): Promise<number> {
    return this.missions.attach(options);
  }

  /**
   * Inspect latest local or remote mission telemetry.
   */
  async getLogs(options: GetLogsOptions): Promise<number> {
    return this.missions.getLogs(options);
  }

  /**
   * Install Orbit shell aliases and tab-completion.
   */
  async installShell(): Promise<void> {
    return this.integrations.installShell();
  }

  /**
   * List all provisioned stations and discovered local repos.
   */
  async listStations(
    options: ListStationsOptions = {},
  ): Promise<StationInfo[]> {
    return this.fleet.listStations(options);
  }

  /**
   * Safe stop of Orbit Station hardware without destroying it.
   */
  async hibernate(options: { name: string }): Promise<void> {
    return this.fleet.hibernate(options);
  }

  /**
   * Set a station as the active target for future commands.
   */
  async activateStation(name: string): Promise<void> {
    return this.fleet.activateStation(name);
  }

  /**
   * Decommission a specific station or all remote capsules.
   */
  async deleteStation(options: DeleteStationOptions): Promise<void> {
    return this.fleet.deleteStation(options);
  }

  /**
   * List all available infrastructure schematics.
   */
  listSchematics(): string[] {
    return this.fleet.listSchematics();
  }

  /**
   * Save a new or existing schematic.
   */
  async saveSchematic(
    name: string,
    config: Partial<OrbitConfig>,
  ): Promise<void> {
    return this.fleet.saveSchematic(name, config);
  }

  /**
   * Import a schematic from a local file or remote URL.
   */
  async importSchematic(source: string): Promise<string> {
    return this.fleet.importSchematic(source);
  }

  /**
   * Run the interactive schematic creation/editing wizard.
   */
  async runSchematicWizard(
    name: string,
    cliFlags: Partial<OrbitConfig> = {},
  ): Promise<void> {
    return this.fleet.runSchematicWizard(name, cliFlags);
  }
}

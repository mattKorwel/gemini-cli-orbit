/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type OrbitConfig, type ProjectContext } from '../core/Constants.js';
import { logger, LogLevel } from '../core/Logger.js';
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
  type HibernateOptions,
  type MonitorCIOptions,
  type SplashdownOptions,
  type SchematicInfo,
  type IOrbitSDK,
  type MissionExecOptions,
} from '../core/types.js';

import { MissionManager } from './MissionManager.js';
import { FleetManager } from './FleetManager.js';
import { StatusManager } from './StatusManager.js';
import { CIManager } from './CIManager.js';
import { IntegrationManager } from './IntegrationManager.js';
import { resolveContextBundles, ConfigManager } from '../core/ConfigManager.js';
import { StationRegistry } from './StationRegistry.js';
import { SchematicManager } from './SchematicManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { InfrastructureFactory } from '../infrastructure/InfrastructureFactory.js';
import { ProcessManager } from '../core/ProcessManager.js';
import { GitExecutor } from '../core/executors/GitExecutor.js';
import { DockerExecutor } from '../core/executors/DockerExecutor.js';
import { TmuxExecutor } from '../core/executors/TmuxExecutor.js';
import { NodeExecutor } from '../core/executors/NodeExecutor.js';
import { GeminiExecutor } from '../core/executors/GeminiExecutor.js';
import { ShellIntegration } from '../utils/ShellIntegration.js';
import { DependencyManager } from './DependencyManager.js';
import { type IExecutors } from '../core/interfaces.js';

export * from '../core/types.js';

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

    // Foundation
    const processManager = new ProcessManager();
    const executors: IExecutors = {
      git: new GitExecutor(processManager),
      docker: new DockerExecutor(processManager),
      tmux: new TmuxExecutor(processManager),
      node: new NodeExecutor(processManager),
      gemini: new GeminiExecutor(processManager),
    };

    // Dependencies
    const configManager = new ConfigManager();
    const providerFactory = new ProviderFactory(processManager, executors);
    const infraFactory = new InfrastructureFactory();
    const shellIntegration = new ShellIntegration();
    const dependencyManager = new DependencyManager(processManager);
    const stationRegistry = new StationRegistry(providerFactory, configManager);
    const schematicManager = new SchematicManager(configManager);

    this.missions = new MissionManager(
      this.projectCtx,
      bundles.infra,
      this.observer,
      providerFactory,
      configManager,
      executors,
      stationRegistry,
    );
    this.fleet = new FleetManager(
      this.projectCtx,
      bundles.infra,
      this.observer,
      stationRegistry,
      schematicManager,
      providerFactory,
      infraFactory,
      configManager,
      dependencyManager,
      executors,
    );
    this.status = new StatusManager(
      this.projectCtx,
      bundles.infra,
      providerFactory,
      executors,
      stationRegistry,
    );
    this.ci = new CIManager(
      this.projectCtx,
      bundles.infra,
      this.observer,
      processManager,
      executors,
    );
    this.integrations = new IntegrationManager(this.observer, shellIntegration);
  }

  /**
   * Check station health and active mission status.
   */
  async getPulse(): Promise<PulseInfo> {
    return this.status.getPulse();
  }

  /**
   * Fetches pulses for multiple stations in parallel.
   */
  async getFleetPulse(
    receipts: import('../core/interfaces.js').StationReceipt[],
  ): Promise<PulseInfo[]> {
    return this.status.getFleetPulse(receipts);
  }

  /**
   * Fetches pulses for ALL local stations registered on this machine.
   */
  async getGlobalLocalPulse(): Promise<PulseInfo[]> {
    return this.status.getGlobalLocalPulse();
  }

  /**
   * Launch or resume an isolated developer presence.
   */
  async startMission(options: MissionOptions): Promise<MissionResult> {
    return this.missions.start(options);
  }

  /**
   * Execute a one-off command in a mission capsule.
   */
  async missionExec(options: MissionExecOptions): Promise<number> {
    return this.missions.exec(options);
  }

  /**
   * Decommission a specific mission and its workspace.
   */
  async jettisonMission(options: JettisonOptions): Promise<MissionResult> {
    return this.missions.jettison(options);
  }

  /**
   * Drops into a raw interactive shell on the hardware host.
   */
  async stationShell(): Promise<number> {
    return this.missions.stationShell();
  }

  /**
   * Drops into a raw interactive shell inside a mission capsule.
   */
  async missionShell(options: { identifier: string }): Promise<number> {
    return this.missions.missionShell(options);
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
  async hibernate(options: HibernateOptions): Promise<void> {
    return this.fleet.hibernate(options);
  }

  /**
   * Set a station as the active target for future commands.
   */
  async activateStation(name: string): Promise<void> {
    return this.fleet.activateStation(name);
  }

  /**
   * List all available infrastructure schematics.
   */
  listSchematics(): SchematicInfo[] {
    return this.fleet.listSchematics();
  }

  /**
   * Get a specific schematic by name.
   */
  getSchematic(name: string): OrbitConfig | null {
    return this.fleet.getSchematic(name);
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

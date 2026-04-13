/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type OrbitConfig,
  type ProjectContext,
  type OrbitContext,
} from '../core/Constants.js';
import { logger, LogLevel } from '../core/Logger.js';
import {
  type OrbitObserver,
  type MissionResult,
  type MissionManifest,
  type StationState,
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
import { ConfigManager } from '../core/ConfigManager.js';
import { StationRegistry } from './StationRegistry.js';
import { SchematicManager } from './SchematicManager.js';
import { StarfleetClient } from './StarfleetClient.js';
import { ShadowManager } from './ShadowManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { InfrastructureFactory } from '../infrastructure/InfrastructureFactory.js';
import { ProcessManager } from '../core/ProcessManager.js';
import { GitExecutor } from '../core/executors/GitExecutor.js';
import { DockerExecutor } from '../core/executors/DockerExecutor.js';
import { TmuxExecutor } from '../core/executors/TmuxExecutor.js';
import { WindowsTmuxExecutor } from '../core/executors/WindowsTmuxExecutor.js';
import { NodeExecutor } from '../core/executors/NodeExecutor.js';
import { GeminiExecutor } from '../core/executors/GeminiExecutor.js';
import { ShellIntegration } from '../utils/ShellIntegration.js';
import { DependencyManager } from './DependencyManager.js';
import { type IExecutors } from '../core/interfaces.js';
import { SshExecutor } from '../core/executors/ssh/SshExecutor.js';
import { WindowsSshExecutor } from '../core/executors/ssh/WindowsSshExecutor.js';

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

  setVerbose(verbose: boolean): void {
    logger.setVerbose(verbose);
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
  private readonly shadow: ShadowManager;

  constructor(
    public readonly context: OrbitContext,
    public readonly observer: OrbitObserver = new DefaultObserver(),
  ) {
    this.projectCtx = context.project;

    // Ensure logger uses the correct repo root for its stream
    logger.setRepoRoot(this.projectCtx.repoRoot);
    logger.setVerbose(context.infra.verbose === true);
    this.observer.setVerbose?.(context.infra.verbose === true);

    // Foundation
    const processManager = new ProcessManager();
    const tmux =
      process.platform === 'win32'
        ? new WindowsTmuxExecutor(processManager)
        : new TmuxExecutor(processManager);

    const executors: IExecutors = {
      git: new GitExecutor(processManager),
      docker: new DockerExecutor(processManager),
      tmux,
      node: new NodeExecutor(processManager),
      gemini: new GeminiExecutor(processManager),
      ssh:
        process.platform === 'win32'
          ? new WindowsSshExecutor(processManager)
          : new SshExecutor(processManager),
    };

    // Dependencies
    const configManager = new ConfigManager();
    const providerFactory = new ProviderFactory(processManager, executors);
    const infraFactory = new InfrastructureFactory();
    const shellIntegration = new ShellIntegration();
    const dependencyManager = new DependencyManager(processManager);
    const stationRegistry = new StationRegistry(providerFactory, configManager);
    const schematicManager = new SchematicManager(configManager);
    const starfleetClient = new StarfleetClient(
      (this.context.infra as any).apiUrl || 'http://localhost:8080',
    );

    // Initializing provider once for the entire SDK session
    const provider = providerFactory.getProvider(
      this.projectCtx,
      this.context.infra as any,
      this.context.state,
    );

    const transport = (provider as any).transport;
    this.shadow = new ShadowManager(transport, this.observer);

    this.missions = new MissionManager(
      this.projectCtx,
      this.context.infra,
      this.observer,
      providerFactory,
      configManager,
      processManager,
      executors,
      stationRegistry,
      starfleetClient,
      this.context.state,
      provider,
    );
    this.status = new StatusManager(
      this.projectCtx,
      this.context.infra,
      this.context.state,
      providerFactory,
      executors,
      stationRegistry,
      provider,
    );
    this.fleet = new FleetManager(
      this.projectCtx,
      this.context.infra,
      this.observer,
      stationRegistry,
      schematicManager,
      providerFactory,
      infraFactory,
      configManager,
      dependencyManager,
      executors,
      this.status,
    );
    this.ci = new CIManager(
      this.projectCtx,
      this.context.infra,
      this.observer,
      processManager,
      executors,
    );
    this.integrations = new IntegrationManager(this.observer, shellIntegration);

    this.missions.setFleetManager(this.fleet);
  }

  /**
   * Check station health and active mission status.
   */
  async getPulse(): Promise<StationState> {
    return this.status.getPulse();
  }

  /**
   * Parallel aggregator for fleet status.
   */
  async getFleetState(options: ListStationsOptions): Promise<StationState[]> {
    const { includeMissions, repoFilter, nameFilter } = options;

    let stations = await this.status['stationRegistry'].listStations();

    // 1. Apply Repository Filter
    if (repoFilter) {
      stations = stations.filter((s) => s.receipt.repo === repoFilter);
    }

    // 2. Apply Name/Pattern Filter
    if (nameFilter) {
      const regex = new RegExp(`^${nameFilter.replace(/\*/g, '.*')}$`, 'i');
      stations = stations.filter(
        (s) => regex.test(s.receipt.name) || regex.test(s.receipt.instanceName),
      );
    }

    // 3. Fetch Reality for the filtered set (Health is the new baseline)
    const states = await this.status.fetchFleetState(
      stations,
      includeMissions ? 'pulse' : 'health',
      options.peek,
    );

    // 4. Mission-level Filtering (Surgical prune)
    const missionFilt =
      options.missionFilter ||
      (options.nameFilter && includeMissions ? options.nameFilter : undefined);
    if (missionFilt) {
      const regex = new RegExp(`^${missionFilt.replace(/\*/g, '.*')}$`, 'i');
      states.forEach((s) => {
        if (s.reality) {
          s.reality.missions = s.reality.missions.filter(
            (m) => regex.test(m.name) || (m.mission && regex.test(m.mission)),
          );
        }
      });

      // Only return stations that still have matching missions
      return states.filter((s) => s.reality && s.reality.missions.length > 0);
    }

    return states;
  }

  /**
   * Fetches pulses for ALL local stations registered on this machine.
   */
  async getGlobalLocalPulse(): Promise<StationState[]> {
    return this.status.getGlobalLocalPulse();
  }

  /**
   * Launch or resume an isolated developer presence.
   */
  async startMission(manifest: MissionManifest): Promise<MissionResult> {
    // Perform surgical shadow sync if --dev is enabled
    await this.shadow.syncIfRequested({ dev: manifest.isDev } as any);

    return this.missions.start(manifest);
  }

  /**
   * Resolve user intent into a concrete MissionManifest.
   */
  async resolveMission(options: MissionOptions): Promise<MissionManifest> {
    // Inject the isDev flag from the context into the mission options if not explicitly set
    const mergedOptions = {
      ...options,
      dev: options.dev !== undefined ? options.dev : this.context.isDev,
    };
    return this.missions.resolve(mergedOptions as any);
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
   * Executes a command on the station host.
   */
  async stationExec(
    command: string,
    args: string[] = [],
    options: any = {},
  ): Promise<number> {
    const provider = (this.missions as any).getProvider();
    const res = await provider.getExecOutput(
      { bin: command, args },
      { ...options, interactive: true },
    );
    return res.status;
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
    options: ListStationsOptions = { includeMissions: true },
  ): Promise<StationState[]> {
    return this.getFleetState(options);
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
    cliFlags?: Partial<OrbitConfig>,
  ): Promise<void> {
    return this.fleet.runSchematicWizard(name, cliFlags);
  }
}

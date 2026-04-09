/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import readline from 'node:readline';
import {
  type InfrastructureSpec,
  type ProjectContext,
  type OrbitConfig,
} from '../core/Constants.js';
import { LogLevel } from '../core/Logger.js';
import {
  type OrbitObserver,
  type StationState,
  type SchematicInfo,
  type ProvisionOptions,
  type ListStationsOptions,
  type HibernateOptions,
  type SplashdownOptions,
} from '../core/types.js';
import {
  type IStationRegistry,
  type ISchematicManager,
  type IProviderFactory,
  type IInfrastructureFactory,
  type IConfigManager,
  type IDependencyManager,
  type IExecutors,
  type IStatusManager,
} from '../core/interfaces.js';

export class FleetManager {
  constructor(
    private readonly projectCtx: ProjectContext,
    private readonly infra: InfrastructureSpec,
    private readonly observer: OrbitObserver,
    private readonly stationManager: IStationRegistry,
    private readonly schematicManager: ISchematicManager,
    private readonly providerFactory: IProviderFactory,
    private readonly infraFactory: IInfrastructureFactory,
    private readonly configManager: IConfigManager,
    private readonly dependencyManager: IDependencyManager,
    private readonly executors: IExecutors,
    private readonly statusManager: IStatusManager,
  ) {}

  /**
   * Build or wake Orbital Station infrastructure. (Idempotent Liftoff)
   */
  async provision(options: ProvisionOptions): Promise<number> {
    const { destroy } = options;
    const config = this.infra;
    const instanceName = config.instanceName || 'default';
    const sName = config.schematic || 'default';

    this.observer.onDivider?.('ORBIT MISSION LIFTOFF');
    this.observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      `📡 Instance: ${instanceName} | Schematic: ${sName}`,
    );

    const isLocal =
      config.providerType === 'local-worktree' ||
      config.providerType === 'local-docker';

    if (!config.projectId && !isLocal) {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'SETUP',
        `❌ No active infrastructure project found. Please specify a projectId or use a local provider.`,
      );
      return 1;
    }

    if (!isLocal) {
      await this.dependencyManager.ensurePulumi();
    }

    const infraProvisioner = this.infraFactory.getProvisioner(
      instanceName,
      config as any,
    );

    if (destroy) {
      this.observer.onLog?.(
        LogLevel.INFO,
        'SETUP',
        `🔥 Decommissioning infrastructure for ${instanceName}...`,
      );
      await infraProvisioner.down();
      this.observer.onLog?.(
        LogLevel.INFO,
        'SETUP',
        '✅ Infrastructure destroyed.',
      );
      return 0;
    }

    // IDEMPOTENCY: Check if instance exists and is hibernated
    const currentStatus = await this.stationManager.listStations();
    const existing = currentStatus.find((s) => s.receipt.name === instanceName);

    if (existing && existing.receipt.status === 'TERMINATED') {
      this.observer.onLog?.(
        LogLevel.INFO,
        'SETUP',
        `💤 Station ${instanceName} is hibernating. Waking up...`,
      );
      const provider = this.providerFactory.getProvider(
        this.projectCtx,
        config as any,
      );
      await provider.start();
    }

    this.observer.onDivider?.('STATION LIFTOFF');
    this.observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      `Verifying infrastructure for ${instanceName}...`,
    );

    const state = await infraProvisioner.up();
    if (state.status === 'error') {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'SETUP',
        `Infrastructure provisioning failed: ${state.error}`,
      );
      return 1;
    }

    const provider = this.providerFactory.getProvider(
      this.projectCtx,
      config as any,
      state,
    );
    if (state.status === 'ready') {
      this.observer.onLog?.(
        LogLevel.INFO,
        'SETUP',
        `✅ Station hardware is active at ${state.privateIp || state.publicIp || 'internal IP'}`,
      );

      // --- STARFLEET VERIFICATION ---
      const verified = await this.waitForSupervisor(provider, instanceName);
      if (!verified) return 1;

      // Ensure Main Mirror exists on host for fast clones
      const remoteUrl = this.configManager.detectRemoteUrl(
        this.projectCtx.repoRoot,
      );
      if (remoteUrl) {
        this.observer.onLog?.(
          LogLevel.INFO,
          'SETUP',
          '   - Optimizing for first mission (Provisioning mirror)...',
        );
        await (provider as any).provisionMirror?.(remoteUrl);
      }
    }

    if (state.status !== 'destroyed' && provider.isPersistent) {
      const settings = this.configManager.loadSettings();
      const stationName = instanceName;
      const rName = this.projectCtx.repoName;

      if (rName && rName !== 'gemini-cli') {
        if (!settings.repos) settings.repos = {};
        if (!settings.repos[rName]) settings.repos[rName] = {} as any;
        settings.repos[rName]!.activeStation = stationName;
      } else {
        settings.activeStation = stationName;
      }

      this.configManager.saveSettings(settings);
      this.observer.onLog?.(
        LogLevel.INFO,
        'SETUP',
        `🎯 Active Station for ${rName || 'global'} set to: ${stationName}`,
      );

      this.stationManager.saveReceipt(provider.getStationReceipt());
    }

    this.observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      '✨ Orbit is ready for mission deployment.',
    );
    return 0;
  }

  /**
   * List all provisioned stations and discovered local repos.
   */
  async listStations(
    options: ListStationsOptions = {},
  ): Promise<StationState[]> {
    const settings = this.configManager.loadSettings();
    const stations = await this.stationManager.listStations({
      syncWithReality: !!options.syncWithReality,
    });

    const states = await this.statusManager.fetchFleetState(
      stations,
      options.includeMissions
        ? 'pulse'
        : options.syncWithReality
          ? 'health'
          : 'inventory',
    );

    // Set Active Marker based on settings
    states.forEach((s) => {
      s.isActive = settings.activeStation === s.receipt.name;
    });

    return states;
  }

  /**
   * Safe stop of Orbit Station hardware without destroying it.
   */
  async hibernate(options: HibernateOptions): Promise<void> {
    const { name } = options;
    const stations = await this.stationManager.listStations();
    const station = stations.find((s) => s.receipt.name === name);

    if (!station) {
      throw new Error(`Station "${name}" not found in registry.`);
    }

    const { provider } = station;

    this.observer.onLog?.(
      LogLevel.INFO,
      'HARDWARE',
      `💤 Hibernating station: ${name}...`,
    );
    await provider.stop();
    this.observer.onLog?.(LogLevel.INFO, 'HARDWARE', '✅ Station stopped.');
  }

  /**
   * Set a station as the active target for future commands.
   */
  async activateStation(name: string): Promise<void> {
    const settings = this.configManager.loadSettings();
    const stations = await this.stationManager.listStations();
    const station = stations.find((s) => s.receipt.name === name);
    if (!station) {
      throw new Error(`Station "${name}" not found in registry.`);
    }

    const rName = this.projectCtx.repoName;
    if (rName && rName !== 'gemini-cli') {
      if (!settings.repos) settings.repos = {};
      if (!settings.repos[rName]) settings.repos[rName] = {} as any;
      settings.repos[rName]!.activeStation = station.receipt.name;
    } else {
      settings.activeStation = station.receipt.name;
    }

    this.configManager.saveSettings(settings);
    this.observer.onLog?.(
      LogLevel.INFO,
      'CONFIG',
      `🎯 Active Station for ${rName || 'global'} set to: ${station.receipt.name}`,
    );
  }

  /**
   * Scoped Emergency shutdown or full decommissioning of Orbit infrastructure.
   */
  async splashdown(options: SplashdownOptions = {}): Promise<number> {
    const { name, all, force } = options;
    const settings = this.configManager.loadSettings();

    // 1. Resolve Target Station (Explicit Name > Active Station)
    const targetName = name || settings.activeStation;
    if (!targetName) {
      this.observer.onLog?.(
        LogLevel.WARN,
        'CLEANUP',
        'No active station to splashdown.',
      );
      return 0;
    }

    // 2. Resolve Target Station
    const stations = await this.stationManager.listStations();
    const station = stations.find((s) => s.receipt.name === targetName);

    if (!station) {
      throw new Error(`Station "${targetName}" not found in registry.`);
    }

    const { receipt, provider } = station;

    this.observer.onLog?.(
      LogLevel.INFO,
      'CLEANUP',
      `🌊 SPLASHDOWN INITIATED: ${receipt.name} (${receipt.type})`,
    );

    // 4. Mission Cleanup (Capsules/Workspaces/Secrets)
    await provider.splashdown({
      all: all || false,
      clearSecrets: true,
    });

    // 5. Destructive Hardware Decommissioning (--all or named)
    // If a name was provided, we assume they want to decommission that station
    if (all || name) {
      const confirmed =
        force ||
        (await this.confirm(
          `⚠️  DESTRUCTIVE: This will PERMANENTLY DELETE all resources for station "${receipt.name}". Proceed? (y/n): `,
        ));

      if (confirmed) {
        this.observer.onLog?.(
          LogLevel.INFO,
          'CLEANUP',
          `   🚜 Destroying Station Infrastructure: ${receipt.name}`,
        );
        const infraProvisioner = this.infraFactory.getProvisioner(
          receipt.instanceName || receipt.name,
          receipt as any,
        );
        await infraProvisioner.down();
        this.stationManager.deleteReceipt(receipt.name);

        if (settings.activeStation === receipt.name) {
          delete settings.activeStation;
          this.configManager.saveSettings(settings);
        }
        this.observer.onLog?.(
          LogLevel.INFO,
          'CLEANUP',
          '✅ Station fully decommissioned.',
        );
      } else {
        this.observer.onLog?.(
          LogLevel.WARN,
          'CLEANUP',
          'Station destruction cancelled.',
        );
      }
    }

    this.observer.onLog?.(LogLevel.INFO, 'CLEANUP', '✅ Splashdown complete.');
    return 0;
  }

  private async waitForSupervisor(
    provider: any,
    name: string,
  ): Promise<boolean> {
    this.observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      `🧪 Waiting for Station '${name}' to ignite...`,
    );

    // Capability Check: If provider has its own ignition logic, use it
    if (provider.verifyIgnition) {
      return provider.verifyIgnition(this.observer);
    }

    // Fallback: Simple ensureReady loop
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000;
    while (Date.now() - startTime < timeout) {
      const readyStatus = await provider.ensureReady();
      if (readyStatus === 0) return true;
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    this.observer.onLog?.(
      LogLevel.ERROR,
      'SETUP',
      `❌ Station verification timed out for '${name}'.`,
    );
    return false;
  }

  private async confirm(query: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) =>
      rl.question(query, (ans) => {
        rl.close();
        resolve(ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes');
      }),
    );
  }

  /**
   * List all available infrastructure schematics.
   */
  listSchematics(): SchematicInfo[] {
    return this.schematicManager.listSchematics();
  }

  /**
   * Get a specific schematic.
   */
  getSchematic(name: string): OrbitConfig | null {
    return this.configManager.loadSchematic(name) as OrbitConfig;
  }

  /**
   * Save a new or existing schematic.
   */
  async saveSchematic(
    name: string,
    config: Partial<OrbitConfig>,
  ): Promise<void> {
    this.configManager.saveSchematic(name, config);
    this.observer.onLog?.(
      LogLevel.INFO,
      'CONFIG',
      `✅ Schematic "${name}" updated and saved.`,
    );
  }

  /**
   * Import a schematic from a local file or remote URL.
   */
  async importSchematic(source: string): Promise<string> {
    const name = await this.schematicManager.importSchematic(source);
    this.observer.onLog?.(
      LogLevel.INFO,
      'CONFIG',
      `✅ Imported schematic "${name}" successfully.`,
    );
    return name;
  }

  /**
   * Run the interactive schematic creation/editing wizard.
   */
  async runSchematicWizard(
    name: string,
    cliFlags: Partial<OrbitConfig> = {},
  ): Promise<void> {
    await this.schematicManager.runWizard(name, cliFlags);
  }
}

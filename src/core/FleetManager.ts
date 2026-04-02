/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type OrbitConfig } from './Constants.js';
import { LogLevel } from './Logger.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import {
  detectRepoName,
  loadSettings,
  saveSettings,
  saveSchematic as saveSchematicToDisk,
  loadSchematic,
} from './ConfigManager.js';
import { StationManager } from './StationManager.js';
import { SchematicManager } from './SchematicManager.js';
import { InfrastructureFactory } from '../infrastructure/InfrastructureFactory.js';
import { DependencyManager } from './DependencyManager.js';
import {
  type OrbitObserver,
  type StationInfo,
  type ProvisionOptions,
  type ListStationsOptions,
  type DeleteStationOptions,
  type SplashdownOptions,
} from './types.js';

export class FleetManager {
  private readonly stationManager = new StationManager();
  private readonly schematicManager = new SchematicManager();

  constructor(
    private readonly config: OrbitConfig,
    private readonly observer: OrbitObserver,
  ) {}

  /**
   * Build or wake Orbital Station infrastructure.
   */
  async provision(options: ProvisionOptions): Promise<number> {
    const { schematicName, destroy } = options;
    const repoName = this.config.repoName || detectRepoName();
    const sName = schematicName || this.config.schematic || 'default';
    const schematic = loadSchematic(sName);

    this.observer.onDivider?.('ORBIT MISSION LIFTOFF');
    this.observer.onLog?.(LogLevel.INFO, 'SETUP', `📡 Schematic: ${sName}`);

    const config = { ...this.config, ...schematic };

    if (!config.projectId && config.providerType !== 'local-worktree') {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'SETUP',
        `❌ No active infrastructure schematic found. Please run "orbit schematic create ${sName}" to set up your blueprints.`,
      );
      return 1;
    }

    if (config.providerType !== 'local-worktree') {
      await DependencyManager.ensurePulumi();
    }

    const infraProvisioner = InfrastructureFactory.getProvisioner(
      sName,
      config as any,
    );

    if (destroy) {
      this.observer.onLog?.(
        LogLevel.INFO,
        'SETUP',
        `🔥 Decommissioning infrastructure for ${sName}...`,
      );
      await infraProvisioner.down();
      this.observer.onLog?.(
        LogLevel.INFO,
        'SETUP',
        '✅ Infrastructure destroyed.',
      );
      return 0;
    }

    this.observer.onDivider?.('STATION LIFTOFF');
    this.observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      `Verifying infrastructure for ${config.instanceName || sName}...`,
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

    const provider = ProviderFactory.getProvider(config as any, state);
    if (state.status === 'ready') {
      this.observer.onLog?.(
        LogLevel.INFO,
        'SETUP',
        `✅ Station is active at ${state.privateIp || state.publicIp || 'internal IP'}`,
      );
      await provider.ensureReady();
    }

    const isLocal =
      config.projectId === 'local' || config.providerType === 'local-worktree';
    if (state.status !== 'destroyed' && !isLocal) {
      const settings = loadSettings();
      const stationName = config.instanceName || sName;

      settings.activeStation = stationName;
      saveSettings(settings);
      this.observer.onLog?.(
        LogLevel.INFO,
        'SETUP',
        `🎯 Active Station set to: ${stationName}`,
      );

      this.stationManager.saveReceipt({
        name: stationName,
        instanceName: stationName,
        type: 'gce',
        projectId: config.projectId!,
        zone: config.zone || 'us-central1-a',
        repo: repoName,
        schematic: sName,
        lastSeen: new Date().toISOString(),
      });
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
  ): Promise<StationInfo[]> {
    const settings = loadSettings();
    const receipts = await this.stationManager.listStations(options);

    const stationInfos: StationInfo[] = await Promise.all(
      receipts.map(async (r) => {
        let missions: string[] = [];
        if (options.includeMissions) {
          try {
            missions = await this.stationManager.getMissions(r);
          } catch (_e) {}
        }

        return {
          name: r.name,
          type: r.type,
          repo: r.repo,
          projectId: r.projectId,
          zone: r.zone,
          rootPath: r.rootPath || undefined,
          lastSeen: r.lastSeen,
          missions,
          isActive: settings.activeStation === r.name,
        };
      }),
    );

    return stationInfos;
  }

  /**
   * Set a station as the active target for future commands.
   */
  async activateStation(name: string): Promise<void> {
    const settings = loadSettings();
    const stations = await this.stationManager.listStations();
    const station = stations.find((s) => s.name === name);
    if (!station) {
      throw new Error(`Station "${name}" not found in registry.`);
    }

    settings.activeStation = station.name;
    saveSettings(settings);
    this.observer.onLog?.(
      LogLevel.INFO,
      'CONFIG',
      `🎯 Active Station set to: ${station.name}`,
    );
  }

  /**
   * Decommission a specific station or all remote capsules.
   */
  async deleteStation(options: DeleteStationOptions): Promise<void> {
    const { name } = options;
    const settings = loadSettings();
    if (name) {
      const stations = await this.stationManager.listStations();
      const receipt = stations.find((s) => s.name === name);

      const provider = ProviderFactory.getProvider({
        instanceName: receipt?.instanceName || name,
        projectId: receipt?.projectId,
        zone: receipt?.zone,
        providerType: receipt?.type || 'gce',
      } as any);

      await provider.destroy();
      this.stationManager.deleteReceipt(name);
      if (settings.activeStation === name) delete settings.activeStation;
      saveSettings(settings);
    } else {
      await this.splashdown({ all: true });
    }
  }

  /**
   * Emergency shutdown of all active remote capsules.
   */
  async splashdown(options: SplashdownOptions = {}): Promise<number> {
    const instanceName = this.config.instanceName || 'local';
    const provider = ProviderFactory.getProvider({
      ...this.config,
      projectId: this.config.projectId || 'local',
      zone: this.config.zone || 'local',
      instanceName,
    });

    this.observer.onLog?.(
      LogLevel.INFO,
      'CLEANUP',
      `🌊 SPLASHDOWN INITIATED: ${instanceName}`,
    );

    const capsules = await provider.listCapsules();
    for (const capsule of capsules) {
      this.observer.onLog?.(
        LogLevel.INFO,
        'CLEANUP',
        `   🔥 Decommissioning capsule: ${capsule}`,
      );
      await provider.stopCapsule(capsule);
      await provider.removeCapsule(capsule);
    }

    if (options.all) {
      this.observer.onLog?.(
        LogLevel.INFO,
        'CLEANUP',
        `   🚜 Stopping Station VM: ${instanceName}`,
      );
      await provider.stop();
    }

    this.observer.onLog?.(LogLevel.INFO, 'CLEANUP', '✅ Splashdown complete.');
    return 0;
  }

  /**
   * List all available infrastructure schematics.
   */
  listSchematics(): string[] {
    return this.schematicManager.listSchematics();
  }

  /**
   * Save a new or existing schematic.
   */
  async saveSchematic(
    name: string,
    config: Partial<OrbitConfig>,
  ): Promise<void> {
    saveSchematicToDisk(name, config);
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

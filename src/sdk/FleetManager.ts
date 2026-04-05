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
  type StationInfo,
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
  type StationReceipt,
  type IExecutors,
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
  ) {}

  /**
   * Build or wake Orbital Station infrastructure. (Idempotent Liftoff)
   */
  async provision(options: ProvisionOptions): Promise<number> {
    const { schematicName, destroy } = options;
    const instanceName = this.infra.instanceName || 'default';
    const sName = schematicName || (this.infra as any).schematic || 'default';

    this.observer.onDivider?.('ORBIT MISSION LIFTOFF');
    this.observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      `📡 Instance: ${instanceName} | Schematic: ${sName}`,
    );

    const schematic = this.configManager.loadSchematic(sName);
    const config = { ...this.infra, ...schematic, instanceName };

    if (!config.projectId && config.providerType !== 'local-worktree') {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'SETUP',
        `❌ No active infrastructure schematic found. Please run "orbit schematic create ${sName}" to set up your blueprints.`,
      );
      return 1;
    }

    if (config.providerType !== 'local-worktree') {
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
    const existing = currentStatus.find((s) => s.name === instanceName);

    if (existing && existing.status === 'TERMINATED') {
      this.observer.onLog?.(
        LogLevel.INFO,
        'SETUP',
        `💤 Station ${instanceName} is hibernating. Waking up...`,
      );
      const provider = this.providerFactory.getProvider(
        this.projectCtx,
        config as any,
      );
      // 'gcloud compute instances start'
      await provider.exec(`echo "Waking VM..."`); // Placeholder for provider.start()
      await (provider as any).start?.();
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
        `✅ Station is active at ${state.privateIp || state.publicIp || 'internal IP'}`,
      );
      await provider.ensureReady();

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

    const isLocal =
      config.projectId === 'local' || config.providerType === 'local-worktree';
    if (state.status !== 'destroyed' && !isLocal) {
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

      this.stationManager.saveReceipt({
        name: stationName,
        instanceName: stationName,
        type: 'gce',
        projectId: config.projectId!,
        zone: config.zone || 'us-central1-a',
        backendType: config.backendType as any,
        repo: this.projectCtx.repoName,
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
    const settings = this.configManager.loadSettings();
    const receipts = await this.stationManager.listStations(options as any);

    const stationInfos: StationInfo[] = await Promise.all(
      receipts.map(async (r: StationReceipt) => {
        let missions: string[] = [];
        let status = r.status || 'READY';

        // Only fetch missions if station is active/ready to avoid hung SSH
        if (
          options.includeMissions &&
          (status === 'RUNNING' || status === 'READY')
        ) {
          try {
            missions = await this.stationManager.getMissions(r);
            this.observer.onLog?.(
              LogLevel.DEBUG,
              'FLEET',
              `Fetched ${missions.length} missions for ${r.name}`,
            );
          } catch (e: any) {
            this.observer.onLog?.(
              LogLevel.DEBUG,
              'FLEET',
              `Failed to fetch missions for ${r.name}: ${e.message}`,
            );
            // If we can't talk to it, mark it as unreachable if it was supposed to be running
            if (status === 'RUNNING') {
              status = 'UNREACHABLE';
            }
          }
        }

        return {
          name: r.name,
          type: r.type,
          repo: r.repo,
          status,
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
   * Safe stop of Orbit Station hardware without destroying it.
   */
  async hibernate(options: HibernateOptions): Promise<void> {
    const { name } = options;
    const stations = await this.stationManager.listStations();
    const receipt = stations.find((s) => s.name === name);

    if (!receipt) {
      throw new Error(`Station "${name}" not found in registry.`);
    }

    const provider = this.providerFactory.getProvider(this.projectCtx, {
      instanceName: receipt.instanceName || name,
      projectId: receipt.projectId,
      zone: receipt.zone,
      providerType: receipt.type,
    } as any);

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
    const station = stations.find((s) => s.name === name);
    if (!station) {
      throw new Error(`Station "${name}" not found in registry.`);
    }

    const rName = this.projectCtx.repoName;
    if (rName && rName !== 'gemini-cli') {
      if (!settings.repos) settings.repos = {};
      if (!settings.repos[rName]) settings.repos[rName] = {} as any;
      settings.repos[rName]!.activeStation = station.name;
    } else {
      settings.activeStation = station.name;
    }

    this.configManager.saveSettings(settings);
    this.observer.onLog?.(
      LogLevel.INFO,
      'CONFIG',
      `🎯 Active Station for ${rName || 'global'} set to: ${station.name}`,
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

    // 2. Fetch Receipt for the target
    const stations = await this.stationManager.listStations();
    const receipt = stations.find((s) => s.name === targetName);

    if (!receipt) {
      throw new Error(`Station "${targetName}" not found in registry.`);
    }

    // 3. Instantiate Scoped Provider
    const provider = this.providerFactory.getProvider(this.projectCtx, {
      instanceName: receipt.instanceName || receipt.name,
      projectId: receipt.projectId,
      zone: receipt.zone,
      providerType: receipt.type,
    } as any);

    this.observer.onLog?.(
      LogLevel.INFO,
      'CLEANUP',
      `🌊 SPLASHDOWN INITIATED: ${receipt.name} (${receipt.type})`,
    );

    // 4. Mission Cleanup (Capsules/Workspaces)
    const capsules = await provider.listCapsules();
    for (const capsule of capsules) {
      this.observer.onLog?.(
        LogLevel.INFO,
        'CLEANUP',
        `   🔥 Decommissioning mission: ${capsule}`,
      );
      await provider.stopCapsule(capsule);
      await provider.removeCapsule(capsule);
    }

    // ADR 14: Clear mission secrets from RAM-disk
    if (capsules.length > 0 || all || name) {
      this.observer.onLog?.(
        LogLevel.INFO,
        'CLEANUP',
        '   🧹 Clearing mission secrets from RAM-disk...',
      );
      await provider.exec('sudo rm -f /dev/shm/.orbit-env-*');
    }

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

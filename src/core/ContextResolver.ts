/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import {
  type OrbitContext,
  type InfrastructureSpec,
  type ProjectContext,
  type OrbitConfig,
  STATIONS_DIR,
  DEFAULT_VPC_NAME,
  DEFAULT_SUBNET_NAME,
  getPrimaryRepoRoot,
} from './Constants.js';
import {
  loadSettings,
  loadProjectConfig,
  loadJson,
  loadSchematic,
  detectRepoName,
} from './ConfigManager.js';

/**
 * ContextResolver: The absolute authority for Orbit configuration.
 *
 * Performs a single, deterministic 'hydration' of the world-view at the
 * start of the application lifecycle.
 */
export class ContextResolver {
  /**
   * Resolves the full OrbitContext from raw inputs.
   */
  static async resolve(options: {
    repoRoot: string;
    flags: Partial<OrbitConfig>;
    env: Record<string, string | undefined>;
  }): Promise<OrbitContext> {
    const { repoRoot, flags, env } = options;

    // STEP 1: Core Identity
    const rName =
      flags.repoName || env.GCLI_ORBIT_REPO_NAME || detectRepoName(repoRoot);
    const project: ProjectContext = {
      repoRoot,
      repoName: rName,
    };

    // STEP 2: Base Layers (Disk-based)
    const projectDefaults = loadProjectConfig(repoRoot);
    const userSettings = loadSettings();

    // Start with empty spec and build up
    let infra: InfrastructureSpec = {};

    // Layer 0: Project Config (.gemini/config.json)
    infra = this.mergeDefined(infra, projectDefaults);

    // Layer 1: User Repo Settings (~/.gemini/settings.json -> repos[name])
    if (userSettings && userSettings.repos && userSettings.repos[rName]) {
      infra = this.mergeDefined(infra, userSettings.repos[rName]);
    }

    // STEP 3: Station & Schematic Resolution
    const targetStation =
      flags.forStation ||
      env.GCLI_ORBIT_INSTANCE_NAME ||
      userSettings.repos[rName]?.activeStation ||
      userSettings.activeStation;

    if (targetStation) {
      const receiptPath = path.join(STATIONS_DIR, `${targetStation}.json`);
      const receipt = loadJson(receiptPath);

      if (receipt) {
        // Layer 2: Station Receipt
        const receiptSpec: InfrastructureSpec = {
          stationName: receipt.name,
          instanceName: receipt.instanceName || receipt.name,
          projectId: receipt.projectId,
          zone: receipt.zone,
          providerType: receipt.type,
          backendType: receipt.backendType,
          schematic: receipt.schematic,
          dnsSuffix: receipt.dnsSuffix,
          userSuffix: receipt.userSuffix,
        };
        infra = this.mergeDefined(infra, receiptSpec);
      } else {
        // Literal name if not registered
        infra.stationName = targetStation;
        infra.instanceName = targetStation;
      }
    }

    // Layer 3: Schematic (Explicit or linked in receipt)
    const sName = flags.schematic || infra.schematic;
    if (sName) {
      const schematic = loadSchematic(sName);
      // ADR 0016: Schematic is a blueprint.
      // If we are explicitly using a schematic, its core provider settings
      // should override stale receipt data (e.g. if we move from local to remote).
      infra = { ...this.mergeDefined(schematic, infra) };

      // Ensure schematic specific overrides for type-switching
      if (schematic.projectId && schematic.projectId !== 'local') {
        infra.projectId = schematic.projectId;
        infra.providerType = schematic.providerType || 'gce';
      }

      infra.schematic = sName;
    }

    // STEP 4: External Overrides (ENV & Flags)

    // Layer 4: Global Settings Overrides
    if (userSettings.tempDir) infra.workspacesDir = userSettings.tempDir;
    if (userSettings.autoClean !== undefined) {
      infra.reaperIdleLimit = userSettings.autoClean ? 24 : undefined;
    }

    // Layer 5: Environment Overrides
    const envSpec: Partial<InfrastructureSpec> = {
      projectId: env.GCLI_ORBIT_PROJECT_ID,
      zone: env.GCLI_ORBIT_ZONE,
      instanceName: env.GCLI_ORBIT_INSTANCE_NAME,
      backendType: env.GCLI_ORBIT_BACKEND as any,
      imageUri: env.GCLI_ORBIT_IMAGE,
      providerType: env.GCLI_ORBIT_PROVIDER as any,
      sshUser: env.USER || env.USERNAME,
      verbose: env.GCLI_ORBIT_VERBOSE === '1' ? true : undefined,
    };
    infra = this.mergeDefined(infra, envSpec);

    // Layer 6: CLI Flags (Final Word)
    const flagSpec: InfrastructureSpec = {
      projectId: flags.local ? 'local' : flags.projectId,
      zone: flags.zone,
      instanceName: flags.instanceName,
      stationName: flags.stationName,
      providerType: flags.local ? 'local-worktree' : flags.providerType,
      backendType: flags.backendType,
      imageUri: flags.imageUri,
      upstreamRepo: flags.upstreamRepo,
      manageNetworking: flags.manageNetworking,
      vpcName: flags.vpcName,
      subnetName: flags.subnetName,
      machineType: flags.machineType,
      sshSourceRanges: flags.sshSourceRanges,
      workspacesDir: flags.workspacesDir,
      worktreesDir: flags.worktreesDir,
      remoteWorkDir: flags.remoteWorkDir,
      useTmux: flags.useTmux,
      cpuLimit: flags.cpuLimit,
      memoryLimit: flags.memoryLimit,
      reaperIdleLimit: flags.reaperIdleLimit,
      dnsSuffix: flags.dnsSuffix,
      userSuffix: flags.userSuffix,
      schematic: flags.schematic,
      verbose: flags.verbose,
    };
    if (flags.forStation) flagSpec.stationName = flags.forStation;
    infra = this.mergeDefined(infra, flagSpec);

    // STEP 5: Dynamic Defaults & Final Resolution

    // Fallback ID
    if (!infra.projectId) infra.projectId = 'local';

    // Provider Type Resolution (Re-evaluate after all merges)
    if (infra.projectId === 'local') {
      infra.providerType = infra.providerType || 'local-worktree';
    } else if (infra.providerType === 'local-worktree' || !infra.providerType) {
      // If we have a real project ID but provider is still local-worktree (stale receipt),
      // we must upgrade to GCE.
      infra.providerType = 'gce';
    }

    // Standardized Station Naming (Hub-side)
    if (!infra.stationName) {
      if (infra.instanceName && infra.projectId !== 'local') {
        infra.stationName = infra.instanceName;
      } else if (infra.projectId === 'local') {
        infra.stationName = `local-${rName}`;
      } else {
        infra.stationName = rName;
      }
    }

    if (!infra.instanceName && infra.projectId !== 'local') {
      const user = (env.USER || env.USERNAME || 'user')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      infra.instanceName = `station-${user}-${rName}`;
    }

    if (infra.projectId === 'local' && !infra.zone) {
      infra.zone = 'localhost';
    }

    if (!infra.workspacesDir) {
      if (infra.projectId && infra.projectId !== 'local') {
        infra.workspacesDir = '/mnt/disks/data/workspaces';
      } else {
        const primaryRoot = getPrimaryRepoRoot(project.repoRoot);
        infra.workspacesDir = path.resolve(
          primaryRoot,
          '..',
          'orbit-git-worktrees',
        );
      }
    }

    if (!infra.remoteWorkDir) infra.remoteWorkDir = '/mnt/disks/data/main';

    // Sync directories
    if (!infra.workspacesDir) infra.workspacesDir = infra.worktreesDir;
    if (!infra.worktreesDir) infra.worktreesDir = infra.workspacesDir;

    if (infra.manageNetworking === undefined) infra.manageNetworking = true;
    if (!infra.vpcName)
      infra.vpcName = infra.manageNetworking ? DEFAULT_VPC_NAME : 'default';
    if (!infra.subnetName)
      infra.subnetName = infra.manageNetworking
        ? DEFAULT_SUBNET_NAME
        : 'default';

    return { project, infra };
  }

  /**
   * Validation Helper
   */
  static validate(context: OrbitContext): void {
    const { infra } = context;
    const isRemote = infra.projectId && infra.projectId !== 'local';

    if (isRemote) {
      if (!infra.projectId)
        throw new Error('Missing PROJECT_ID for remote station.');
      if (!infra.zone) throw new Error('Missing ZONE for remote station.');
      if (!infra.instanceName)
        throw new Error('Missing INSTANCE_NAME for remote station.');
    }
  }

  /**
   * Only merges properties that are NOT undefined in the source.
   */
  private static mergeDefined<T extends object>(
    target: T,
    source: Partial<T>,
  ): T {
    const result = { ...target };
    for (const key in source) {
      if (source[key] !== undefined) {
        (result as any)[key] = source[key];
      }
    }
    return result;
  }
}

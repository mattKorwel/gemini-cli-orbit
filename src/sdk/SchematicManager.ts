/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import {
  SCHEMATICS_DIR,
  DEFAULT_VPC_NAME,
  DEFAULT_SUBNET_NAME,
  type OrbitConfig,
} from '../core/Constants.js';
import { sanitizeName } from '../core/ConfigManager.js';
import { logger } from '../core/Logger.js';
import { type SchematicInfo } from '../core/types.js';
import {
  type ISchematicManager,
  type IConfigManager,
} from '../core/interfaces.js';

function ask(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
}

export class SchematicManager implements ISchematicManager {
  constructor(private readonly configManager: IConfigManager) {}

  /**
   * Runs the interactive wizard to create or edit an infrastructure schematic.
   */
  async runWizard(
    name: string,
    cliFlags: Partial<OrbitConfig> = {},
  ): Promise<void> {
    const schematicPath = path.join(SCHEMATICS_DIR, `${name}.json`);
    const existingConfig = this.configManager.loadJson(schematicPath) || {};

    // Pick only known config keys
    const knownKeys = [
      'projectId',
      'zone',
      'networkAccessType',
      'dnsSuffix',
      'userSuffix',
      'useDefaultNetwork',
      'manageFirewallRules',
      'vpcName',
      'subnetName',
      'instanceName',
      'machineType',
      'imageUri',
      'gitAuthMode',
      'geminiAuthMode',
      'repoToken',
      'sshSourceRanges',
      'bootDiskType',
      'dataDiskType',
    ];

    const cleanFlags: any = {};
    for (const key of knownKeys) {
      let val = (cliFlags as any)[key];
      if (val !== undefined) {
        // Handle type casting from CLI strings
        if (
          (key === 'useDefaultNetwork' || key === 'manageFirewallRules') &&
          typeof val === 'string'
        ) {
          val = val.toLowerCase() === 'true';
        }
        if (key === 'sshSourceRanges' && typeof val === 'string') {
          val = val.split(',').map((s) => s.trim());
        }
        cleanFlags[key] = val;
      }
    }

    const hasConfigFlags = Object.keys(cleanFlags).length > 0;

    if (hasConfigFlags) {
      const merged = { ...existingConfig, ...cleanFlags };
      this.configManager.saveSchematic(name, merged);
      logger.info(
        'CONFIG',
        `✅ Headless update: Schematic "${name}" updated and saved.`,
      );
      return;
    }

    // Merge existing config with any surgical flags provided
    const base = { ...existingConfig, ...cliFlags };

    logger.divider(`ORBIT SCHEMATIC WIZARD: ${name.toUpperCase()}`);
    console.log('Fill in your infrastructure blueprints below.');
    console.log('Press [Enter] to keep the current value shown in brackets.\n');

    const projectId =
      (await ask(`GCP Project ID [${base.projectId || ''}]: `)) ||
      base.projectId;

    const zone =
      (await ask(`GCE Zone [${base.zone || 'us-central1-a'}]: `)) ||
      base.zone ||
      'us-central1-a';

    let networkAccessType = base.networkAccessType || 'direct-internal';
    const backendChoice = await ask(
      `Backend Type (1: direct-internal, 2: external) [${networkAccessType === 'external' ? '2' : '1'}]: `,
    );
    if (backendChoice === '1') networkAccessType = 'direct-internal';
    if (backendChoice === '2') networkAccessType = 'external';

    const dnsSuffix =
      (await ask(
        `DNS Suffix (e.g. internal.zone.com) [${base.dnsSuffix || ''}]: `,
      )) || base.dnsSuffix;

    const userSuffix =
      (await ask(
        `User Suffix (e.g. _google_com) [${base.userSuffix || ''}]: `,
      )) || base.userSuffix;

    const useDefaultNetworkRaw = await ask(
      `Use the GCP default VPC/subnet? (y/n) [${base.useDefaultNetwork ? 'y' : 'n'}]: `,
    );
    const useDefaultNetwork = useDefaultNetworkRaw
      ? useDefaultNetworkRaw.toLowerCase() === 'y'
      : !!base.useDefaultNetwork;

    const vpcName = useDefaultNetwork
      ? 'default'
      : base.vpcName || DEFAULT_VPC_NAME;

    const subnetName = useDefaultNetwork
      ? 'default'
      : base.subnetName || DEFAULT_SUBNET_NAME;

    const instanceName =
      (await ask(
        `Station VM Name [${base.instanceName || 'station-supervisor'}]: `,
      )) ||
      base.instanceName ||
      'station-supervisor';

    const machineType =
      (await ask(
        `GCE Machine Type [${base.machineType || 'n2-standard-8'}]: `,
      )) ||
      base.machineType ||
      'n2-standard-8';

    const manageFirewallRulesRaw = await ask(
      `Should Orbit manage SSH firewall rules on the chosen network? (y/n) [${base.manageFirewallRules === false ? 'n' : 'y'}]: `,
    );
    const manageFirewallRules = manageFirewallRulesRaw
      ? manageFirewallRulesRaw.toLowerCase() === 'y'
      : base.manageFirewallRules !== false;

    let sshSourceRanges = base.sshSourceRanges;
    if (manageFirewallRules) {
      const rangesRaw = await ask(
        `Allowed SSH Source Ranges (comma separated) [${(base.sshSourceRanges || []).join(',')}]: `,
      );
      if (rangesRaw) {
        sshSourceRanges = rangesRaw.split(',').map((r) => r.trim());
      }
    }

    const newConfig = {
      ...base,
      projectId,
      zone,
      networkAccessType,
      dnsSuffix,
      userSuffix,
      useDefaultNetwork,
      manageFirewallRules,
      vpcName,
      subnetName,
      instanceName,
      machineType,
      sshSourceRanges,
    };

    this.configManager.saveSchematic(name, newConfig);
    logger.info(
      'CONFIG',
      `✨ Schematic "${name}" saved to ${SCHEMATICS_DIR}/${name}.json`,
    );
  }

  async importSchematic(source: string): Promise<string> {
    let content: string;

    if (source.startsWith('http')) {
      logger.info('CONFIG', `🌐 Fetching remote schematic from ${source}...`);
      const res = spawnSync('curl', ['-sL', source], { stdio: 'pipe' });
      if (res.status !== 0) {
        const errorMsg = res.stderr.toString();
        throw new Error(`Failed to fetch remote schematic: ${errorMsg}`, {
          cause: new Error(errorMsg),
        });
      }
      content = res.stdout.toString();
    } else {
      const p = path.resolve(source);
      if (!fs.existsSync(p)) throw new Error(`Local file not found: ${p}`);
      content = fs.readFileSync(p, 'utf8');
    }

    try {
      const config = JSON.parse(content);

      // --- 🛡️ BASIC SCHEMA VALIDATION ---
      const required = ['projectId', 'zone', 'networkAccessType'];
      const missing = required.filter((f) => !config[f]);
      if (missing.length > 0) {
        throw new Error(
          `Schematic is missing required infrastructure fields: ${missing.join(', ')}`,
        );
      }

      // Sanitize the source for name derivation
      const name = sanitizeName(
        config.schematicName ||
          config.profileName ||
          path.basename(source, '.json'),
      );

      this.configManager.saveSchematic(name, config);
      return name;
    } catch (e: any) {
      throw new Error(`Invalid JSON schematic: ${e.message}`, { cause: e });
    }
  }

  listSchematics(): SchematicInfo[] {
    if (!fs.existsSync(SCHEMATICS_DIR)) return [];
    const files = fs
      .readdirSync(SCHEMATICS_DIR)
      .filter((f) => f.endsWith('.json'));

    return files.map((f) => {
      const name = f.replace('.json', '');
      const config = this.configManager.loadSchematic(name);
      const info: SchematicInfo = { name };
      if (config?.projectId) info.projectId = config.projectId;
      if (config?.zone) info.zone = config.zone;
      if (config?.networkAccessType)
        info.networkAccessType = config.networkAccessType;
      if (config?.machineType) info.machineType = config.machineType;
      return info;
    });
  }
}

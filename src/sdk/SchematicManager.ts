/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { SCHEMATICS_DIR, type OrbitConfig } from '../core/Constants.js';
import {
  saveSchematic,
  loadJson,
  sanitizeName,
} from '../core/ConfigManager.js';
import { logger } from '../core/Logger.js';

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

export class SchematicManager {
  /**
   * Runs the interactive wizard to create or edit an infrastructure schematic.
   */
  async runWizard(
    name: string,
    cliFlags: Partial<OrbitConfig> = {},
  ): Promise<void> {
    const schematicPath = path.join(SCHEMATICS_DIR, `${name}.json`);
    const existingConfig = loadJson(schematicPath) || {};

    // If surgical flags are provided, perform a headless update and exit
    // We check if any of our known config keys are present in cliFlags
    const hasConfigFlags = Object.keys(cliFlags).length > 0;

    if (hasConfigFlags) {
      // Pick only known config keys
      const knownKeys = [
        'projectId',
        'zone',
        'backendType',
        'dnsSuffix',
        'userSuffix',
        'vpcName',
        'subnetName',
        'instanceName',
        'machineType',
        'imageUri',
        'manageNetworking',
        'sshSourceRanges',
      ];
      const cleanFlags: any = {};
      for (const key of knownKeys) {
        let val = (cliFlags as any)[key];
        if (val !== undefined) {
          // Handle type casting from CLI strings
          if (key === 'manageNetworking' && typeof val === 'string') {
            val = val.toLowerCase() === 'true';
          }
          if (key === 'sshSourceRanges' && typeof val === 'string') {
            val = val.split(',').map((s) => s.trim());
          }
          cleanFlags[key] = val;
        }
      }

      const merged = { ...existingConfig, ...cleanFlags };
      saveSchematic(name, merged);
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

    let backendType = base.backendType || 'direct-internal';
    const backendChoice = await ask(
      `Backend Type (1: direct-internal, 2: external) [${backendType === 'external' ? '2' : '1'}]: `,
    );
    if (backendChoice === '1') backendType = 'direct-internal';
    if (backendChoice === '2') backendType = 'external';

    const dnsSuffix =
      (await ask(
        `DNS Suffix (e.g. internal.zone.com) [${base.dnsSuffix || ''}]: `,
      )) || base.dnsSuffix;

    const userSuffix =
      (await ask(
        `User Suffix (e.g. _google_com) [${base.userSuffix || ''}]: `,
      )) || base.userSuffix;

    const vpcName =
      (await ask(`VPC Network Name [${base.vpcName || 'default'}]: `)) ||
      base.vpcName ||
      'default';

    const subnetName =
      (await ask(`Subnet Name [${base.subnetName || 'default'}]: `)) ||
      base.subnetName ||
      'default';

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

    const manageNetworkingRaw = await ask(
      `Should Orbit automatically manage VPC, NAT, and Firewalls? (y/n) [${base.manageNetworking ? 'y' : 'n'}]: `,
    );
    const manageNetworking = manageNetworkingRaw
      ? manageNetworkingRaw.toLowerCase() === 'y'
      : !!base.manageNetworking;

    let sshSourceRanges = base.sshSourceRanges;
    if (manageNetworking) {
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
      backendType,
      dnsSuffix,
      userSuffix,
      vpcName,
      subnetName,
      instanceName,
      machineType,
      manageNetworking,
      sshSourceRanges,
    };

    saveSchematic(name, newConfig);
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
      const required = ['projectId', 'zone', 'backendType'];
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

      saveSchematic(name, config);
      return name;
    } catch (e: any) {
      throw new Error(`Invalid JSON schematic: ${e.message}`, { cause: e });
    }
  }

  listSchematics(): string[] {
    if (!fs.existsSync(SCHEMATICS_DIR)) return [];
    return fs
      .readdirSync(SCHEMATICS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  }
}

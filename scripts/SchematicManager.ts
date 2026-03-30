/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { SCHEMATICS_DIR } from './Constants.js';
import {
  saveSchematic,
  loadJson,
  parseFlags,
  sanitizeName,
} from './ConfigManager.js';
import { logger } from './Logger.js';

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
  async runWizard(name: string): Promise<void> {
    const schematicPath = path.join(SCHEMATICS_DIR, `${name}.json`);
    const existingConfig = loadJson(schematicPath) || {};
    const flags = parseFlags(process.argv.slice(2));

    // Merge existing config with any surgical flags provided
    const base = { ...existingConfig, ...flags };

    logger.divider(`ORBIT SCHEMATIC WIZARD: ${name.toUpperCase()}`);
    console.log('Fill in your infrastructure blueprints below.');
    console.log('(Surgical flags detected and will be pre-filled)\n');

    const projectId =
      base.projectId ||
      (await ask(`GCP Project ID [${base.projectId || ''}]: `));
    const zone =
      base.zone ||
      (await ask(`GCE Zone [${base.zone || 'us-central1-a'}]: `)) ||
      'us-central1-a';

    let backendType = base.backendType;
    if (!backendType) {
      console.log('\nConnectivity Backends:');
      console.log(
        '  1. direct-internal (VPC-internal, requires corporate network/VPN)',
      );
      console.log('  2. external        (Public IP, standard GCE access)');
      const backendChoice = await ask(
        `\nSelect backend [${base.backendType === 'external' ? '2' : '1'}]: `,
      );
      backendType =
        backendChoice === '2'
          ? 'external'
          : backendChoice === '1'
            ? 'direct-internal'
            : base.backendType || 'direct-internal';
    }

    const dnsSuffix =
      base.dnsSuffix ||
      (await ask(`DNS Suffix (e.g. gcpnode.com) [${base.dnsSuffix || ''}]: `));
    const userSuffix =
      base.userSuffix ||
      (await ask(
        `User Suffix (e.g. _google_com) [${base.userSuffix || ''}]: `,
      ));

    const vpcName =
      base.vpcName ||
      (await ask(`VPC Network Name [${base.vpcName || 'orbit'}]: `)) ||
      'orbit';
    const subnetName =
      base.subnetName ||
      (await ask(`Subnet Name [${base.subnetName || 'orbit'}]: `)) ||
      'orbit';

    const newConfig = {
      ...base,
      projectId,
      zone,
      backendType,
      dnsSuffix,
      userSuffix,
      vpcName,
      subnetName,
      instanceName: base.instanceName || 'station-supervisor',
      machineType: base.machineType || 'n2-standard-8',
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

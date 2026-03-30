/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { PROFILES_DIR } from './Constants.js';
import { saveProfile, loadJson, parseFlags } from './ConfigManager.js';
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

export class DesignManager {
  /**
   * Runs the interactive wizard to create or edit a station design (profile).
   * Supports surgical overrides via CLI flags.
   */
  async runWizard(name: string): Promise<void> {
    const profilePath = path.join(PROFILES_DIR, `${name}.json`);
    const existingConfig = loadJson(profilePath) || {};
    const flags = parseFlags(process.argv.slice(2));

    // Merge existing config with any surgical flags provided
    const base = { ...existingConfig, ...flags };

    logger.divider(`ORBIT DESIGN WIZARD: ${name.toUpperCase()}`);
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

    saveProfile(name, newConfig);
    logger.info(
      'CONFIG',
      `✨ Design "${name}" saved to ${PROFILES_DIR}/${name}.json`,
    );
  }

  async importDesign(source: string): Promise<string> {
    let content: string;

    if (source.startsWith('http')) {
      logger.info('CONFIG', `🌐 Fetching remote design from ${source}...`);
      const res = spawnSync('curl', ['-sL', source], { stdio: 'pipe' });
      if (res.status !== 0) {
        const errorMsg = res.stderr.toString();
        throw new Error(`Failed to fetch remote design: ${errorMsg}`, {
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
      const name =
        config.profileName ||
        path.basename(source, '.json').replace(/[^a-z0-9]/g, '-');
      saveProfile(name, config);
      return name;
    } catch (e: any) {
      throw new Error(`Invalid JSON design: ${e.message}`, { cause: e });
    }
  }

  listDesigns(): string[] {
    if (!fs.existsSync(PROFILES_DIR)) return [];
    return fs
      .readdirSync(PROFILES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  }
}

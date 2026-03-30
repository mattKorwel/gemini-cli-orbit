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
import { saveProfile, loadJson } from './ConfigManager.js';
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
   */
  async runWizard(name: string): Promise<void> {
    const profilePath = path.join(PROFILES_DIR, `${name}.json`);
    const existingConfig = loadJson(profilePath) || {};

    logger.divider(`ORBIT DESIGN WIZARD: ${name.toUpperCase()}`);
    console.log('Fill in your infrastructure blueprints below.\n');

    const projectId =
      (await ask(`GCP Project ID [${existingConfig.projectId || ''}]: `)) ||
      existingConfig.projectId;
    const zone =
      (await ask(`GCE Zone [${existingConfig.zone || 'us-central1-a'}]: `)) ||
      existingConfig.zone ||
      'us-central1-a';

    console.log('\nConnectivity Backends:');
    console.log(
      '  1. direct-internal (VPC-internal, requires corporate network/VPN)',
    );
    console.log('  2. external        (Public IP, standard GCE access)');
    const backendChoice = await ask(
      `\nSelect backend [${existingConfig.backendType === 'external' ? '2' : '1'}]: `,
    );
    const backendType =
      backendChoice === '2'
        ? 'external'
        : backendChoice === '1'
          ? 'direct-internal'
          : existingConfig.backendType || 'direct-internal';

    const dnsSuffix =
      (await ask(
        `DNS Suffix (e.g. gcpnode.com) [${existingConfig.dnsSuffix || ''}]: `,
      )) || existingConfig.dnsSuffix;
    const userSuffix =
      (await ask(
        `User Suffix (e.g. _google_com) [${existingConfig.userSuffix || ''}]: `,
      )) || existingConfig.userSuffix;

    const vpcName =
      (await ask(
        `VPC Network Name [${existingConfig.vpcName || 'orbit'}]: `,
      )) ||
      existingConfig.vpcName ||
      'orbit';
    const subnetName =
      (await ask(`Subnet Name [${existingConfig.subnetName || 'orbit'}]: `)) ||
      existingConfig.subnetName ||
      'orbit';

    const newConfig = {
      ...existingConfig,
      projectId,
      zone,
      backendType,
      dnsSuffix,
      userSuffix,
      vpcName,
      subnetName,
      instanceName: existingConfig.instanceName || 'station-supervisor',
      machineType: existingConfig.machineType || 'n2-standard-8',
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

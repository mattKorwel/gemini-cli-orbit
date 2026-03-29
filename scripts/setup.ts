/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline';

import { ProviderFactory } from './providers/ProviderFactory.js';
import {
  loadSettings,
  loadProjectConfig,
  getRepoConfig,
  detectRepoName,
} from './ConfigManager.js';
import { logger } from './Logger.js';
import {
  GLOBAL_SETTINGS_PATH,
  GLOBAL_ORBIT_DIR,
  PROFILES_DIR,
  SCRIPTS_PATH,
  UPSTREAM_REPO_URL,
  UPSTREAM_ORG,
} from './Constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.cwd();

/**
 * Loads and parses a local .env file.
 */
function loadDotEnv() {
  const envPaths = [
    path.join(REPO_ROOT, '.env'),
    path.join(os.homedir(), '.env'),
  ];

  envPaths.forEach((envPath) => {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match && match[1] && match[2]) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["'](.*)["']$/, '$1');
          if (!process.env[key]) process.env[key] = value;
        }
      });
    }
  });
}

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

async function confirm(
  query: string,
  defaultValue: boolean = true,
  shouldRun: boolean = true,
): Promise<boolean> {
  if (!shouldRun) return defaultValue;
  const ans = await ask(`${query} (y/n) [${defaultValue ? 'Y' : 'N'}]: `);
  if (!ans) return defaultValue;
  return ans.toLowerCase().startsWith('y');
}

/**
 * Setup Orbit: Initial configuration and station provisioning.
 */
export async function runSetup(env: NodeJS.ProcessEnv = process.env) {
  loadDotEnv();
  const args = process.argv.slice(2);
  const repoName = detectRepoName();
  const isSurgical = args.length > 0 && !args.includes('--reconfigure');

  logger.divider('ORBIT MISSION LIFTOFF');

  if (isSurgical) {
    logger.info('SETUP', `✨ Surgical Update using CLI flags`);
  }

  // 1. Resolve Design (Profile)
  let selectedDesign =
    args.find((a) => a.startsWith('--profile='))?.split('=')[1] ||
    env.GCLI_ORBIT_PROFILE;
  const globalSettings = loadSettings();
  const projectConfig = loadProjectConfig();

  if (!selectedDesign && !isSurgical) {
    const designs = fs
      .readdirSync(PROFILES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));

    if (designs.length > 0) {
      console.log('\nAvailable Infrastructure Designs:');
      designs.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
      const choice = await ask('\nSelect a design [1]: ');
      selectedDesign = designs[parseInt(choice || '1') - 1];
    }
  }

  // 2. Finalize Configuration
  const config = getRepoConfig(repoName);

  // 3. Save Settings
  const updatedGlobal = { ...globalSettings };
  updatedGlobal.repos[repoName] = {
    profile: selectedDesign || config.profile,
    projectId: config.projectId,
    instanceName: config.instanceName,
    zone: config.zone,
    remoteWorkDir: config.remoteWorkDir,
    tempDir: config.tempDir,
    autoClean: config.autoClean,
  };
  updatedGlobal.activeRepo = repoName;
  if (selectedDesign) updatedGlobal.activeProfile = selectedDesign;

  if (!fs.existsSync(GLOBAL_ORBIT_DIR))
    fs.mkdirSync(GLOBAL_ORBIT_DIR, { recursive: true });
  fs.writeFileSync(
    GLOBAL_SETTINGS_PATH,
    JSON.stringify(updatedGlobal, null, 2),
  );

  // 4. Shell Integration
  if (args.includes('--shell-integration')) {
    spawnSync(
      'node',
      [path.join(path.dirname(SCRIPTS_PATH), 'bundle/bin/install-shell.js')],
      { stdio: 'inherit' },
    );
  }

  // 5. Execution
  const provider = ProviderFactory.getProvider(config as any);
  logger.divider('STATION LIFTOFF');

  const setupNet = args.includes('--setup-net') || config.autoSetupNet;

  logger.info('SETUP', `Finding station ${config.instanceName}...`);
  let status = await provider.getStatus();

  if (status.status === 'NOT_FOUND' || setupNet) {
    logger.info('SETUP', `Provisioning station ${config.instanceName}...`);
    const code = await provider.provision({ setupNetwork: !!setupNet });
    if (code !== 0) return code;
    status = await provider.getStatus();
  }

  if (status.status === 'TERMINATED') {
    logger.info('SETUP', `Waking up station ${config.instanceName}...`);
    await provider.ensureReady();
  }

  logger.info('SETUP', '✨ Orbit is ready for mission deployment.');
  return 0;
}

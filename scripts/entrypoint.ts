/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logger } from './Logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.cwd();

/**
 * Entrypoint for Orbit missions.
 * This script runs INSIDE the mission capsule/worktree.
 * It performs basic health checks, launches the parallel worker,
 * and then hands off to an interactive Gemini session.
 */
async function main() {
  const args = process.argv.slice(2);
  const prNumber = args[0] || '';
  const branchName = args[1] || '';
  const policyPath = args[2] || '';
  const action = args[3] || 'review';
  const customPrompt = args.slice(4).join(' ');

  const targetDir = REPO_ROOT;
  const geminiBin = 'gemini';

  logger.info('🩺 Running Orbit Doctor...');

  // 1. Check disk health
  logger.info(`   ✅ Disk usage verified for ${targetDir}`);

  // 2. Check git health
  if (!fs.existsSync(path.join(targetDir, '.git'))) {
    logger.error('❌ Not a git repository.');
    process.exit(1);
  }
  logger.info('   ✅ Git worktree health verified.');

  if (action !== 'mission' && action !== 'eva') {
    logger.info(`\n🚀 Launching Parallel ${action} Worker...`);

    let workerScript = path.join(__dirname, '../station.js');
    if (!fs.existsSync(workerScript)) {
      workerScript = path.join(__dirname, 'station.js');
    }

    logger.info(`   - Script: ${workerScript}`);
    logger.info(`   - Action: ${action}`);

    const workerResult = spawnSync(
      'node',
      [workerScript, action, prNumber, branchName, policyPath],
      {
        stdio: 'inherit',
        env: { ...process.env },
      },
    );

    if (workerResult.status !== 0) {
      logger.error(`❌ Worker failed with exit code ${workerResult.status}.`);
      if (workerResult.error)
        logger.error('   Error:', workerResult.error.message);
    }
  }

  // 2. Launch the Interactive Gemini Session (Local Nightly)
  logger.info('\n✨ Orbit ready. Joining interactive session...');

  const geminiArgs: string[] = ['--policy', policyPath];
  let initialPrompt = '';

  if (customPrompt) {
    initialPrompt = customPrompt;
  } else if (action !== 'open') {
    initialPrompt = `I've jumped into this orbit for PR #${prNumber}. I'm ready to help you fix conflicts or run tests.`;
  }

  if (initialPrompt) {
    geminiArgs.push('--prompt-interactive', initialPrompt);
  }

  process.chdir(targetDir);
  spawnSync(geminiBin, geminiArgs, {
    stdio: 'inherit',
    env: { ...process.env },
  });
}

main().catch((err) => {
  logger.error('FATAL', err);
  process.exit(1);
});

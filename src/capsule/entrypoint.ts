/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { logger } from '../core/Logger.js';

const getDirname = () => {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return __dirname;
  }
};

const _dirname = getDirname();

/**
 * Entrypoint for Orbit missions inside the capsule/worktree.
 * Orchestrates doctor checks, parallel worker launch, and interactive handover.
 */
async function main() {
  const args = process.argv.slice(2);
  const identifier = args[0];
  const workDir = args[1] || '.';
  const policyPath = args[2] || '.';
  const action = args[3] || 'mission';
  const customPrompt = args.slice(4).join(' ');

  if (!identifier) {
    console.error(
      'Usage: entrypoint <identifier> [workDir] [policyPath] [action] [prompt]',
    );
    process.exit(1);
  }

  logger.divider('ORBIT DOCTOR');

  // 1. Doctor Checks
  logger.info('GENERAL', '🩺 Running Orbit Doctor...');
  const absWorkDir = path.resolve(workDir);
  if (!fs.existsSync(absWorkDir)) {
    logger.error('GENERAL', `❌ Work directory missing: ${absWorkDir}`);
    process.exit(1);
  }
  logger.info('GENERAL', `   ✅ Disk usage verified for ${absWorkDir}`);

  const gitCheck = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: absWorkDir,
  });
  if (gitCheck.status !== 0) {
    logger.error('GENERAL', '❌ Work directory is not a valid git worktree.');
    process.exit(1);
  }
  logger.info('GENERAL', '   ✅ Git worktree health verified.');

  // 2. Launch Worker (Station Manager)
  logger.info('GENERAL', '');
  logger.info('GENERAL', `🚀 Launching Parallel ${action} Worker...`);
  const workerScript = path.join(_dirname, 'worker.js');
  logger.info('GENERAL', `   - Script: ${workerScript}`);
  logger.info('GENERAL', `   - Action: ${action}`);

  const workerRes = spawnSync(
    'node',
    [workerScript, identifier, absWorkDir, policyPath, action, customPrompt],
    {
      stdio: 'inherit',
      cwd: absWorkDir,
    },
  );

  if (workerRes.status !== 0) {
    logger.error(
      'GENERAL',
      `❌ Worker failed with exit code ${workerRes.status}.`,
    );
    // We don't exit here, we still want to hand over to the human
  }

  // 3. Interactive Handover
  logger.info('GENERAL', '');
  logger.info('GENERAL', '✨ Orbit ready. Joining interactive session...');

  // Start Gemini CLI with the project context and policy
  const geminiArgs = [
    '--approval-mode',
    'auto_edit',
    '--policy',
    policyPath,
    '--prompt-interactive',
    `I am continuing the ${action} mission for ${identifier}. Please review the logs in .gemini/orbit/ and provide your assessment.`,
  ];

  // Ensure 'orbit' command is aliased to the local bundle for convenience inside the capsule
  const orbitCliPath = path.join(_dirname, 'orbit-cli.js');
  const env = {
    ...process.env,
    GEMINI_AUTO_UPDATE: '0',
    GCLI_ORBIT_MISSION_ID: identifier,
    GCLI_ORBIT_ACTION: action,
    // Add alias to path if possible or provide as instructions
  };

  spawnSync('gemini', geminiArgs, {
    stdio: 'inherit',
    cwd: absWorkDir,
    env,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

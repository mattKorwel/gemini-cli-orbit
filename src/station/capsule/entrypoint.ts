/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { logger } from '../../core/Logger.js';
import { ProcessManager } from '../../core/ProcessManager.js';
import { GitExecutor } from '../../core/executors/GitExecutor.js';
import { GeminiExecutor } from '../../core/executors/GeminiExecutor.js';
import { NodeExecutor } from '../../core/executors/NodeExecutor.js';

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
 * Orchestrates doctor checks and dispatches to either a playbook or chat.
 */
async function main() {
  const args = process.argv.slice(2);
  const identifier = args[0];
  const workDir = args[1] || '.';
  const policyPath = args[2] || '.';
  const action = args[3] || 'chat';

  if (!identifier) {
    console.error(
      'Usage: entrypoint <identifier> [workDir] [policyPath] [action]',
    );
    process.exit(1);
  }

  const absWorkDir = path.resolve(workDir);
  logger.divider('ORBIT DOCTOR');

  // 1. Doctor Checks
  logger.info('GENERAL', '🩺 Running Orbit Doctor...');
  if (!fs.existsSync(absWorkDir)) {
    logger.error('GENERAL', `❌ Work directory missing: ${absWorkDir}`);
    process.exit(1);
  }

  const gitCheckCmd = {
    bin: 'git',
    args: ['rev-parse', '--is-inside-work-tree'],
    options: { cwd: absWorkDir, quiet: true },
  };
  const gitCheck = ProcessManager.runSync(
    gitCheckCmd.bin,
    gitCheckCmd.args,
    gitCheckCmd.options,
  );
  if (gitCheck.status !== 0) {
    logger.error('GENERAL', '❌ Work directory is not a valid git worktree.');
    process.exit(1);
  }
  logger.info('GENERAL', '   ✅ Git worktree health verified.');

  // 2. Dispatching
  if (action === 'chat') {
    logger.info('GENERAL', '✨ Orbit ready. Joining interactive session...');

    // Resolve absolute path of gemini
    const geminiBin = 'gemini';
    const env = {
      ...process.env,
      GEMINI_AUTO_UPDATE: '0',
      GCLI_ORBIT_MISSION_ID: identifier,
      GCLI_ORBIT_ACTION: action,
    };

    const geminiCmd = GeminiExecutor.create(geminiBin, {
      approvalMode: 'auto_edit',
      policy: policyPath,
      promptInteractive: `I am continuing the ${action} mission for ${identifier}. Please review the logs in .gemini/orbit/ and provide your assessment.`,
      cwd: absWorkDir,
      env,
      interactive: true,
    });

    ProcessManager.runSync(geminiCmd.bin, geminiCmd.args, geminiCmd.options);
  } else {
    // Playbook Dispatch
    logger.info('GENERAL', `🏃 Launching ${action} playbook...`);
    const stationScript = path.join(_dirname, 'station.js');

    // We call back into station.js 'run-internal' to actually execute the playbook
    // This avoids duplicating the playbook loading logic.
    const playbookCmd = NodeExecutor.create(
      stationScript,
      [
        'run-internal',
        identifier,
        identifier, // branch
        action,
        policyPath,
      ],
      { cwd: absWorkDir, interactive: true },
    );

    ProcessManager.runSync(
      playbookCmd.bin,
      playbookCmd.args,
      playbookCmd.options,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

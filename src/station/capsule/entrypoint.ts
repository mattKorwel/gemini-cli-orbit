/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { logger } from '../../core/Logger.js';
import { ProcessManager } from '../../core/ProcessManager.js';
import { GeminiExecutor } from '../../core/executors/GeminiExecutor.js';
import { NodeExecutor } from '../../core/executors/NodeExecutor.js';
import { getManifestFromEnv } from '../../utils/MissionUtils.js';

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
  // ADR 0018: Hydrate context from environment manifest
  const manifest = getManifestFromEnv();
  const { identifier, action, workDir, policyPath } = manifest;

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

    // ADR: Smarter resumption logic.
    // Only use --resume latest if a previous session actually exists in ~/.gemini/sessions
    const sessionsDir = path.join(os.homedir(), '.gemini/sessions');
    const hasSessions =
      fs.existsSync(sessionsDir) && fs.readdirSync(sessionsDir).length > 0;

    // Resolve absolute path of gemini
    const geminiBin = 'gemini';
    const env = {
      ...process.env,
      GEMINI_AUTO_UPDATE: '0',
      GCLI_ORBIT_MISSION_ID: identifier,
      GCLI_ORBIT_ACTION: action,
    };

    const geminiOpts: any = {
      approvalMode: 'plan', // Default to plan mode for safety in chat missions
      policy: policyPath,
      cwd: absWorkDir,
      env,
      interactive: true,
    };

    if (hasSessions) {
      geminiOpts.resume = 'latest';
      geminiOpts.promptInteractive = `Orbit Mission ${identifier} resumed. Standing by.`;
    } else {
      geminiOpts.promptInteractive = `Orbit Mission ${identifier} (${action}) initialized. Standing by for instructions.`;
    }

    const geminiCmd = GeminiExecutor.create(geminiBin, geminiOpts);

    ProcessManager.runSync(geminiCmd.bin, geminiCmd.args, geminiCmd.options);
  } else {
    // Playbook Dispatch
    logger.info('GENERAL', `🏃 Launching ${action} playbook...`);
    const stationScript = path.join(_dirname, 'station.js');

    // We call back into station.js 'run-internal' to actually execute the playbook
    // This avoids duplicating the playbook loading logic.
    // ADR 0018: No positional arguments passed
    const playbookCmd = NodeExecutor.create(stationScript, ['run-internal'], {
      cwd: absWorkDir,
      interactive: true,
    });

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

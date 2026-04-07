/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { logger } from '../../core/Logger.js';
import { GeminiExecutor } from '../../core/executors/GeminiExecutor.js';
import { GitExecutor } from '../../core/executors/GitExecutor.js';
import { getMissionManifest } from '../../utils/MissionUtils.js';
import { type IProcessManager } from '../../core/interfaces.js';
import { ProcessManager } from '../../core/ProcessManager.js';

import { runReviewPlaybook } from '../../playbooks/review.js';
import { runFixPlaybook } from '../../playbooks/fix.js';
import { SessionManager } from '../../utils/SessionManager.js';
import { TempManager } from '../../utils/TempManager.js';
import { updateState } from './hooks.js';

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
export async function main(pm: IProcessManager = new ProcessManager()) {
  // ADR 0018: Hydrate context from environment manifest
  const manifest = getMissionManifest();
  logger.setVerbose(manifest.verbose === true);
  const { identifier, action, workDir, policyPath } = manifest;

  const absWorkDir = path.resolve(workDir);
  logger.divider('ORBIT DOCTOR');

  // 1. Doctor Checks
  logger.info('GENERAL', '🩺 Running Orbit Doctor...');
  if (!fs.existsSync(absWorkDir)) {
    logger.error('GENERAL', `❌ Work directory missing: ${absWorkDir}`);
    return 1;
  }

  const gitCheck = pm.runSync(
    'git',
    GitExecutor.revParse(absWorkDir, ['--is-inside-work-tree']).args,
    { cwd: absWorkDir, quiet: true },
  );
  if (gitCheck.status !== 0) {
    logger.error('GENERAL', '❌ Work directory is not a valid git worktree.');
    return 1;
  }
  logger.info('GENERAL', '   ✅ Git worktree health verified.');

  // Transition from INITIALIZING to IDLE
  updateState(absWorkDir, { status: 'IDLE' });

  // Resolve log directory and other mission-specific paths
  const tempManager = new TempManager({ tempDir: manifest.tempDir });
  const sessionId =
    SessionManager.getSessionIdFromEnv() ||
    SessionManager.generateMissionId(identifier, action);
  const logDir = tempManager.getDir(sessionId);

  const missionHeader = `🚀 Mission: ${identifier} | Action: ${action}`;

  // 2. Dispatching
  if (action === 'chat') {
    logger.info('GENERAL', '✨ Orbit ready. Joining interactive session...');

    const sessionsDir = path.join(os.homedir(), '.gemini/sessions');
    const hasSessions =
      fs.existsSync(sessionsDir) && fs.readdirSync(sessionsDir).length > 0;

    const geminiBin = 'gemini';
    const env = {
      ...process.env,
      GEMINI_AUTO_UPDATE: '0',
      GCLI_ORBIT_MISSION_ID: identifier,
      GCLI_ORBIT_ACTION: action,
    };

    // ADR 0017: Inject mission-control hooks
    const hooksPath = path.resolve(_dirname, 'hooks.js');
    const hookCmd = `node ${hooksPath}`;

    const geminiOpts: any = {
      approvalMode: 'plan',
      policy: policyPath,
      cwd: absWorkDir,
      env,
      interactive: true,
    };

    if (hasSessions) {
      geminiOpts.resume = 'latest';
    }

    const geminiCmd = GeminiExecutor.create(geminiBin, geminiOpts);
    logger.info(
      'GENERAL',
      `🏃 Executing: ${geminiCmd.bin} ${geminiCmd.args.join(' ')}`,
    );
    const res = pm.runSync(geminiCmd.bin, geminiCmd.args, geminiCmd.options);
    return res.status;
  } else {
    // Playbook Dispatch
    logger.info('GENERAL', `🏃 Launching ${action} playbook...`);

    switch (action) {
      case 'review':
        return runReviewPlaybook(
          identifier,
          absWorkDir,
          policyPath,
          'gemini',
          logDir,
          missionHeader,
          pm,
        );
      case 'fix':
        return runFixPlaybook(
          identifier,
          absWorkDir,
          policyPath,
          'gemini',
          logDir,
          missionHeader,
          pm,
        );
      case 'implement': {
        const { runImplementPlaybook } =
          await import('../../playbooks/implement.js');
        return runImplementPlaybook(
          identifier,
          absWorkDir,
          policyPath,
          'gemini',
          logDir,
          missionHeader,
          pm,
        );
      }
      default:
        logger.error('GENERAL', `❌ Unknown playbook action: ${action}`);
        return 1;
    }
  }
}

if (
  process.argv[1] &&
  (import.meta.url === pathToFileURL(process.argv[1]).href ||
    import.meta.url === `file://${process.argv[1]}`)
) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

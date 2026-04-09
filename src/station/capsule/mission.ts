/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { logger } from '../../core/Logger.js';
import { GeminiExecutor } from '../../core/executors/GeminiExecutor.js';
import { getMissionManifest } from '../../utils/MissionUtils.js';
import { type IProcessManager } from '../../core/interfaces.js';
import { ProcessManager } from '../../core/ProcessManager.js';

import { runReviewPlaybook } from '../../playbooks/review.js';
import { runFixPlaybook } from '../../playbooks/fix.js';
import { SessionManager } from '../../utils/SessionManager.js';
import { TempManager } from '../../utils/TempManager.js';
import { updateState } from './hooks.js';

/**
 * Entrypoint for Orbit missions inside the capsule.
 * Pure Workflow Dispatcher: Assumes environment is already prepared by the Supervisor.
 */
export async function main(pm: IProcessManager = new ProcessManager()) {
  const manifest = getMissionManifest();
  logger.setVerbose(manifest.verbose === true);
  const { identifier, action, workDir, policyPath } = manifest;

  const absWorkDir = path.resolve(workDir);

  // Note: Redundant "Doctor Checks" (Git/FS) have been removed.
  // The Starfleet Supervisor handles infrastructure health before spawning this container.

  // Transition to IDLE state
  updateState(absWorkDir, { status: 'IDLE' });

  // Resolve mission-specific paths
  const tempManager = new TempManager({ tempDir: manifest.tempDir });
  const sessionId =
    SessionManager.getSessionIdFromEnv() ||
    SessionManager.generateMissionId(identifier, action);
  const logDir = tempManager.getDir(sessionId);

  const missionHeader = `🚀 Mission: ${identifier} | Action: ${action}`;

  // Dispatching Logic
  if (action === 'chat') {
    logger.info('GENERAL', '✨ Orbit ready. Joining interactive session...');

    const sessionsDir = path.join(os.homedir(), '.gemini/sessions');
    const hasSessions =
      fs.existsSync(sessionsDir) && fs.readdirSync(sessionsDir).length > 0;

    const geminiOpts: any = {
      approvalMode: 'plan',
      policy: policyPath,
      cwd: absWorkDir,
      env: {
        ...process.env,
        GEMINI_AUTO_UPDATE: '0',
        GCLI_ORBIT_MISSION_ID: identifier,
        GCLI_ORBIT_ACTION: action,
        GCLI_TRUST: '1',
      },
      interactive: true,
    };

    if (hasSessions) {
      geminiOpts.resume = 'latest';
    }

    const geminiCmd = GeminiExecutor.create('gemini', geminiOpts);
    const res = pm.runSync(geminiCmd.bin, geminiCmd.args, geminiCmd.options);

    if (res.status !== 0) {
      console.error(`❌ Gemini failed with status ${res.status}`);
    } else {
      console.info('✅ Interactive session complete.');
    }

    return res.status;
  } else {
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
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

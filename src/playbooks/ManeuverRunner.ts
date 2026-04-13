/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import { logger } from '../core/Logger.js';
import { type IProcessManager } from '../core/interfaces.js';
import { GeminiExecutor } from '../core/executors/GeminiExecutor.js';
import { WindowsGeminiExecutor } from '../core/executors/WindowsGeminiExecutor.js';
import { LOCAL_BUNDLE_PATH, BUNDLE_PATH } from '../core/Constants.js';

export interface ManeuverOptions {
  identifier: string;
  action: string;
  targetDir: string;
  policyPath: string;
  logDir: string;
  pm: IProcessManager;
  protocolName: string;
}

/**
 * runAgenticManeuver: Launches a high-fidelity autonomous Gemini session.
 * 1. Performs pre-flight context acquisition.
 * 2. Loads a maneuver protocol prompt.
 * 3. Dispatches a single autonomous Gemini session.
 */
export async function runAgenticManeuver(
  options: ManeuverOptions,
): Promise<number> {
  const {
    identifier,
    action,
    targetDir,
    policyPath,
    logDir,
    pm,
    protocolName,
  } = options;

  // 1. Resolve effective bundle paths
  const isRemote =
    process.env.GCLI_ORBIT_INSTANCE_NAME || fs.existsSync(BUNDLE_PATH);
  const effectiveBundle = isRemote ? BUNDLE_PATH : LOCAL_BUNDLE_PATH;

  // 2. PHASE 0: Pre-flight Context Acquisition
  // This generates 'mission-context.md' and other diagnostics
  logger.info('GENERAL', `🛰️  Phase 0: Acquiring Mission Context...`);
  const contextCmd = `node ${effectiveBundle}/utils/fetch-mission-context.js ${identifier} ${logDir} gemini ${policyPath}`;
  const contextRes = pm.runSync('sh', ['-c', contextCmd], { cwd: targetDir });

  if (contextRes.status !== 0) {
    logger.warn(
      'GENERAL',
      '⚠️  Pre-flight context acquisition failed. Proceeding with raw data...',
    );
  }

  // 3. PHASE 1: Launch Agentic Maneuver
  logger.info('GENERAL', `🚀 Phase 1: Launching ${action} maneuver...`);

  // Load Protocol Prompt
  const protocolPath = path.join(
    effectiveBundle,
    `playbooks/prompts/${protocolName}.md`,
  );
  let protocolPrompt = '';
  if (fs.existsSync(protocolPath)) {
    protocolPrompt = fs.readFileSync(protocolPath, 'utf8');
  } else {
    logger.warn('GENERAL', `⚠️  Protocol prompt not found: ${protocolPath}`);
    protocolPrompt = `Perform a ${action} mission for identifier ${identifier}.`;
  }

  const geminiExecutor =
    process.platform === 'win32'
      ? new WindowsGeminiExecutor(pm)
      : new GeminiExecutor(pm);

  // Note: We use the '-y' flag for autonomous mode,
  // and we pass the protocol + context as the initial prompt.
  const geminiOpts: any = {
    approvalMode: 'plan',
    policy: policyPath,
    cwd: targetDir,
    autoApprove: true,
    env: {
      ...process.env,
      GCLI_ORBIT_MISSION_ID: identifier,
      GCLI_ORBIT_ACTION: action,
      GCLI_TRUST: '1',
      GCLI_ORBIT_LOG_DIR: logDir,
    },
    // We pass the objective as a combined prompt
    prompt: `${protocolPrompt}\n\nYour Mission Context has been prepared in ${path.join(logDir, 'mission-context.md')}. Start by reviewing the CI status.`,
  };

  const geminiCmd = geminiExecutor.create('gemini', geminiOpts);

  // Launch the autonomous session
  const res = pm.runSync(geminiCmd.bin, geminiCmd.args, geminiCmd.options);

  if (res.status === 0) {
    logger.info('GENERAL', `✅ ${action} maneuver complete.`);
  } else {
    logger.error(
      'GENERAL',
      `❌ ${action} maneuver failed with status ${res.status}`,
    );
  }

  return res.status;
}

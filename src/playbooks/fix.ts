/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTaskRunner } from '../core/TaskRunner.js';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { type IProcessManager } from '../core/interfaces.js';
import { LOCAL_BUNDLE_PATH, BUNDLE_PATH } from '../core/Constants.js';

export async function runFixPlaybook(
  prNumber: string,
  targetDir: string,
  policyPath: string,
  geminiBin: string,
  logDir: string,
  missionHeader: string,
  pm?: IProcessManager,
) {
  const runner = createTaskRunner(logDir, missionHeader, pm);

  // Resolve the effective bundle directory based on environment
  const isRemote =
    geminiBin.includes('docker') || process.env.GCLI_ORBIT_INSTANCE_NAME;
  const effectiveBundle = isRemote ? BUNDLE_PATH : LOCAL_BUNDLE_PATH;

  // Detect project type
  const hasPackageJson = fs.existsSync(path.join(targetDir, 'package.json'));

  // 1. PHASE 0: Parallel Diagnostics
  runner.register([
    {
      id: 'context',
      name: 'PR Mission Context',
      cmd: `node ${effectiveBundle}/utils/fetch-mission-context.js ${prNumber} ${logDir} ${geminiBin} ${policyPath}`,
      timeout: 300000,
    },
    {
      id: 'diff',
      name: 'Fetch PR Diff',
      cmd: `gh pr diff ${prNumber} || git diff origin/main...HEAD`,
      timeout: 60000,
    },
    {
      id: 'ci',
      name: 'CI Monitor',
      cmd: `node ${effectiveBundle}/utils/ci.mjs`,
      timeout: 300000,
    },
    {
      id: 'comments',
      name: 'Fetch Feedback',
      cmd: `node ${effectiveBundle}/utils/fetch-pr-info.js ${prNumber}`,
      timeout: 60000,
    },
    {
      id: 'build',
      name: 'Baseline Build',
      // Only build if it's a node project
      cmd: hasPackageJson
        ? `cd ${targetDir} && npm ci && npm run build`
        : `echo "Non-Node project detected. Skipping build."`,
      timeout: 600000,
    },
  ]);

  const diagStatus = await runner.runParallel();
  if (diagStatus !== 0) {
    console.warn(
      '⚠️ Phase 0 diagnostics had some failures. Proceeding with caution...',
    );
  }

  // 2. PHASE 1: Sequential Remediation
  runner.register([
    {
      id: 'sync',
      name: 'Sync & Conflict Resolution',
      cmd: `${geminiBin} --policy ${policyPath} -y -p "Analyze conflict-status.json in ${logDir}. If there are conflicts with the base branch, resolve them now. If not, just say 'No conflicts'."`,
      timeout: 600000,
    },
    {
      id: 'repair-ci',
      name: 'CI & Build Repair',
      cmd: `${geminiBin} --policy ${policyPath} -y -p "Analyze the CI failures in ${path.join(logDir, 'ci.log')} and ${path.join(logDir, 'build.log')}. Fix the failing tests or lint errors found in the current codebase."`,
      timeout: 900000,
    },
    {
      id: 'address-comments',
      name: 'Address PR Feedback',
      cmd: `node ${effectiveBundle}/utils/fetch-pr-info.js ${prNumber} | ${geminiBin} --policy ${policyPath} -y -p "Address the outstanding technical feedback provided on stdin."`,
      timeout: 600000,
    },
  ]);

  await runner.runAll();

  // 3. PHASE 2: Verification
  runner.register([
    {
      id: 'verify-build',
      name: 'Final Build Verification',
      cmd: hasPackageJson
        ? `cd ${targetDir} && npm run build`
        : `echo "Skipping build verification for non-Node project."`,
      timeout: 600000,
    },
    {
      id: 'proof',
      name: 'Behavioral Proof (Proof)',
      dep: 'verify-build',
      cmd: `${geminiBin} --policy ${policyPath} -y -p "Using the fix results, physically exercise the updated code in the terminal. Provide logs proving the fixes work."`,
      timeout: 900000,
    },
  ]);

  const verifyStatus = await runner.runParallel();

  // 4. PHASE 3: Synthesis
  console.log('\n⏳ Synthesizing final fix assessment...');
  const synthesisCmd = `${geminiBin} --policy ${policyPath} -y -p "Summarize the fix mission for PR #${prNumber}. List what was fixed (conflicts, CI, comments) and verify against the mission context in ${path.join(logDir, 'context.log')}. Use the logs in ${logDir} for evidence."`;

  const synthesisStatus = await runner.run(
    `${synthesisCmd} > ${path.join(logDir, 'final-fix-assessment.md')} 2>&1`,
  );

  if (synthesisStatus === 0) {
    const finalPath = path.join(logDir, 'final-fix-assessment.md');
    console.log(`\n✅ Fix mission complete: ${finalPath}`);

    // Update mission state to COMPLETED
    const stateFile = path.join(targetDir, '.gemini/orbit/state.json');
    if (fs.existsSync(stateFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        const assessment = fs.readFileSync(finalPath, 'utf8');
        state.status = 'COMPLETED';
        state.last_thought = assessment.slice(0, 300);
        state.timestamp = new Date().toISOString();
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
      } catch {}
    }

    // Trigger notification
    spawnSync('sh', [
      '-c',
      `printf "\\e]9;Fix Complete | PR #${prNumber} | Final assessment ready.\\a"`,
    ]);
  }

  return synthesisStatus !== 0 || verifyStatus !== 0 ? 1 : 0;
}

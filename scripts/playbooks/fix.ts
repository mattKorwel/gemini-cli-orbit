/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTaskRunner } from '../TaskRunner.js';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';

export async function runFixPlaybook(prNumber: string, targetDir: string, policyPath: string, geminiBin: string) {
  const logDir = path.join(targetDir, `.gemini/logs/orbit-fix-${prNumber}`);
  const runner = createTaskRunner(logDir, `🚀 Orbit | CONSOLIDATED FIX | PR #${prNumber}`);

  // 1. PHASE 0: Parallel Diagnostics
  runner.register([
    { id: 'metadata', name: 'PR Mission Context', cmd: `tsx scripts/utils/fetch-mission-context.ts ${prNumber} ${logDir} ${geminiBin} ${policyPath}` },
    { id: 'diff', name: 'Fetch PR Diff', cmd: `gh pr diff ${prNumber} > ${path.join(logDir, 'pr-diff.diff')}` },
    { id: 'ci', name: 'CI Monitor', cmd: `node scripts/utils/ci.mjs > ${path.join(logDir, 'ci-status.md')} 2>&1` },
    { id: 'comments', name: 'Fetch Feedback', cmd: `node scripts/utils/fetch-pr-info.js ${prNumber} > ${path.join(logDir, 'comments.log')} 2>&1` },
    { id: 'build', name: 'Baseline Build', cmd: `cd ${targetDir} && npm ci && npm run build > ${path.join(logDir, 'build.log')} 2>&1` }
  ]);

  await runner.runParallel();

  // 2. PHASE 1: Sequential Remediation
  runner.register([
    { id: 'sync', name: 'Sync & Conflict Resolution', cmd: `${geminiBin} --policy ${policyPath} -p "Analyze conflict-status.json in ${logDir}. If there are conflicts with the base branch, resolve them now. If not, just say 'No conflicts'."` },
    { id: 'repair-ci', name: 'CI & Build Repair', cmd: `${geminiBin} --policy ${policyPath} -p "Analyze the CI failures in ${path.join(logDir, 'ci-status.md')} and build.log in ${logDir}. Fix the failing tests or lint errors found in the current codebase."` },
    { id: 'address-comments', name: 'Address PR Feedback', cmd: `${geminiBin} --policy ${policyPath} -p "Analyze the PR comments in ${path.join(logDir, 'comments.log')}. Address any outstanding technical feedback found in those comments."` }
  ]);

  await runner.runAll();

  // 3. PHASE 2: Verification
  runner.register([
    { id: 'verify-build', name: 'Final Build Verification', cmd: `cd ${targetDir} && npm run build > ${path.join(logDir, 'verify-build.log')} 2>&1` },
    { id: 'proof', name: 'Mustard Test (Proof)', cmd: `${geminiBin} --policy ${policyPath} -p "Using the fix results, physically exercise the updated code in the terminal. Provide logs proving the fixes work."` }
  ]);

  await runner.runParallel();

  // 4. PHASE 3: Synthesis
  console.log('\n⏳ Synthesizing final fix assessment...');
  const synthesisCmd = `${geminiBin} --policy ${policyPath} -p "Summarize the fix mission for PR #${prNumber}. List what was fixed (conflicts, CI, comments) and verify against the mission context in ${path.join(logDir, 'mission-context.md')}. Use the logs in ${logDir} for evidence." > ${path.join(logDir, 'final-fix-assessment.md')} 2>&1`;
  
  const synthesisStatus = await runner.run(synthesisCmd);
  
  if (synthesisStatus === 0) {
    console.log(`\n✅ Fix mission complete: ${path.join(logDir, 'final-fix-assessment.md')}`);
    // Trigger notification
    spawnSync('sh', ['-c', `printf "\\e]9;Fix Complete | PR #${prNumber} | Final assessment ready.\\a"`]);
  }

  return synthesisStatus;
}

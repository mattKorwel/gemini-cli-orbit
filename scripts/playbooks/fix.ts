/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTaskRunner } from '../TaskRunner.js';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';

export async function runFixPlaybook(prNumber: string, targetDir: string, policyPath: string, geminiBin: string, logDir: string) {
  const runner = createTaskRunner(logDir, `🚀 Orbit | CONSOLIDATED FIX | PR #${prNumber}`);

  // 1. PHASE 0: Parallel Diagnostics
  runner.register([
    { id: 'context', name: 'PR Mission Context', cmd: `tsx scripts/utils/fetch-mission-context.ts ${prNumber} ${logDir} ${geminiBin} ${policyPath}` },
    { id: 'diff', name: 'Fetch PR Diff', cmd: `gh pr diff ${prNumber}` },
    { id: 'ci', name: 'CI Monitor', cmd: `node scripts/utils/ci.mjs` },
    { id: 'comments', name: 'Fetch Feedback', cmd: `node scripts/utils/fetch-pr-info.js ${prNumber}` },
    { id: 'build', name: 'Baseline Build', cmd: `cd ${targetDir} && npm ci && npm run build` }
  ]);

  await runner.runParallel();

  // 2. PHASE 1: Sequential Remediation
  runner.register([
    { id: 'sync', name: 'Sync & Conflict Resolution', cmd: `${geminiBin} -p "Analyze conflict-status.json. If there are conflicts with the base branch, resolve them now. If not, just say 'No conflicts'."` },
    { id: 'repair-ci', name: 'CI & Build Repair', cmd: `${geminiBin} -p "Analyze the CI failures in ci.log and build.log. Fix the failing tests or lint errors found in the current codebase."` },
    { id: 'address-comments', name: 'Address PR Feedback', cmd: `${geminiBin} -p "Analyze the PR comments in comments.log. Address any outstanding technical feedback found in those comments."` }
  ]);

  await runner.runAll();

  // 3. PHASE 2: Verification
  runner.register([
    { id: 'verify-build', name: 'Final Build Verification', cmd: `cd ${targetDir} && npm run build` },
    { id: 'proof', name: 'Mustard Test (Proof)', cmd: `${geminiBin} -p "Using the fix results, physically exercise the updated code in the terminal. Provide logs proving the fixes work."` }
  ]);

  await runner.runParallel();

  // 4. PHASE 3: Synthesis
  console.log('\n⏳ Synthesizing final fix assessment...');
  const synthesisCmd = `${geminiBin} -p "Summarize the fix mission for PR #${prNumber}. List what was fixed (conflicts, CI, comments) and verify against the mission context in context.log. Use the logs for evidence."`;
  
  const synthesisStatus = await runner.run(`${synthesisCmd} > ${path.join(logDir, 'final-fix-assessment.md')} 2>&1`);
  
  if (synthesisStatus === 0) {
    console.log(`\n✅ Fix mission complete: ${path.join(logDir, 'final-fix-assessment.md')}`);
    // Trigger notification
    spawnSync('sh', ['-c', `printf "\\e]9;Fix Complete | PR #${prNumber} | Final assessment ready.\\a"`]);
  }

  return synthesisStatus;
}

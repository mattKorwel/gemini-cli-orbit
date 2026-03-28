/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTaskRunner } from '../TaskRunner.js';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';

export async function runReviewPlaybook(prNumber: string, targetDir: string, policyPath: string, geminiBin: string, logDir: string, guidelinesPath?: string) {
  const runner = createTaskRunner(logDir, `🚀 Orbit | CONSOLIDATED REVIEW | PR #${prNumber}`);

  // 1. PHASE 0: Parallel Context Acquisition
  runner.register([
    { id: 'context', name: 'PR Mission Context', cmd: `tsx scripts/utils/fetch-mission-context.ts ${prNumber} ${logDir} ${geminiBin} ${policyPath}`, timeout: 300000 },
    { id: 'diff', name: 'Fetch PR Diff', cmd: `gh pr diff ${prNumber}`, timeout: 60000 },
    { id: 'build', name: 'Single-Source Build', cmd: `cd ${targetDir} && npm ci && npm run build`, timeout: 600000 }
  ]);

  const contextStatus = await runner.runParallel();
  if (contextStatus !== 0) {
    console.warn('⚠️ Phase 0 context acquisition had some failures. Proceeding with caution...');
  }

  // 2. PHASE 1: Parallel Evaluation
  // Determine if we have custom rules (Repo-specific development guidelines)
  let rulesReference = 'the standard project rules';
  if (guidelinesPath && fs.existsSync(guidelinesPath)) {
    rulesReference = `the explicit mission guidelines in ${guidelinesPath}`;
  } else {
    const possibleRulePaths = [
      path.join(targetDir, 'GEMINI.md'),
      path.join(targetDir, '.gemini/review-rules.md'),
      path.join(targetDir, 'CONTRIBUTING.md')
    ];
    const foundRulePaths = possibleRulePaths.filter(p => fs.existsSync(p));
    if (foundRulePaths.length > 0) {
      rulesReference = `the repo-specific development guidelines in ${foundRulePaths.join(', ')}`;
    }
  }

  runner.register([
    { id: 'ci', name: 'CI Monitor', cmd: `node scripts/utils/ci.mjs`, timeout: 300000 },
    { id: 'static', name: 'Static Standards', cmd: `${geminiBin} --policy ${policyPath} -p "Analyze the diff in diff.log against ${rulesReference} and the mission context in context.log. Provide a detailed review of code quality, TS types, and architecture."`, timeout: 600000 },
    { id: 'feedback', name: 'Feedback Analysis', cmd: `node scripts/utils/fetch-pr-info.js ${prNumber} && ${geminiBin} --policy ${policyPath} -p "Summarize the unresolved PR feedback."`, timeout: 600000 },
    { id: 'proof', name: 'Behavioral Proof', dep: 'build', cmd: `${geminiBin} --policy ${policyPath} -p "Using the build logs in build.log and the diff in diff.log, physically exercise the new code in the terminal. Provide logs proving it works."`, timeout: 900000 }
  ]);

  const evalStatus = await runner.runParallel();

  // 3. PHASE 2: Synthesis
  console.log('\n⏳ Synthesizing final assessment...');
  const synthesisCmd = `${geminiBin} --policy ${policyPath} -p "Merge the results from ci.log, static.log, feedback.log, and proof.log into a final assessment for PR #${prNumber}. Indicate if the PR meets its goals as defined in context.log."`;

  
  const synthesisStatus = await runner.run(`${synthesisCmd} > ${path.join(logDir, 'final-assessment.md')} 2>&1`);
  
  if (synthesisStatus === 0) {
    console.log(`\n✅ Final assessment complete: ${path.join(logDir, 'final-assessment.md')}`);
    // Trigger notification
    spawnSync('sh', ['-c', `printf "\\e]9;Review Complete | PR #${prNumber} | Final assessment ready.\\a"`]);
  }

  return (synthesisStatus !== 0 || evalStatus !== 0) ? 1 : 0;
}

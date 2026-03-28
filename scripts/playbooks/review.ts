/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTaskRunner } from '../TaskRunner.js';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';

export async function runReviewPlaybook(prNumber: string, targetDir: string, policyPath: string, geminiBin: string) {
  const logDir = path.join(targetDir, `.gemini/logs/orbit-review-${prNumber}`);
  const runner = createTaskRunner(logDir, `🚀 Orbit | CONSOLIDATED REVIEW | PR #${prNumber}`);

  // 1. PHASE 0: Parallel Context Acquisition
  runner.register([
    { id: 'metadata', name: 'PR Mission Context', cmd: `tsx scripts/utils/fetch-mission-context.ts ${prNumber} ${logDir} ${geminiBin} ${policyPath}` },
    { id: 'diff', name: 'Fetch PR Diff', cmd: `gh pr diff ${prNumber} > ${path.join(logDir, 'pr-diff.diff')}` },
    { id: 'build', name: 'Single-Source Build', cmd: `cd ${targetDir} && npm ci && npm run build > ${path.join(logDir, 'build.log')} 2>&1` }
  ]);

  await runner.runParallel();

  // 2. PHASE 1: Parallel Evaluation
  // Determine if we have custom rules (Repo-specific development guidelines)
  const possibleRulePaths = [
    path.join(targetDir, 'GEMINI.md'),
    path.join(targetDir, '.gemini/review-rules.md'),
    path.join(targetDir, 'CONTRIBUTING.md')
  ];
  const foundRulePaths = possibleRulePaths.filter(p => fs.existsSync(p));
  
  let rulesReference = 'the standard project rules in commands/orbit/mission.toml';
  if (foundRulePaths.length > 0) {
    rulesReference = `the repo-specific development guidelines in ${foundRulePaths.join(', ')}`;
  }

  runner.register([
    { id: 'ci', name: 'CI Monitor', cmd: `node scripts/utils/ci.mjs ${prNumber} > ${path.join(logDir, 'ci-status.md')} 2>&1` },
    { id: 'static', name: 'Static Standards', cmd: `${geminiBin} --policy ${policyPath} -p "Analyze the diff in ${path.join(logDir, 'pr-diff.diff')} against ${rulesReference} and the mission context in ${path.join(logDir, 'mission-context.md')}. Provide a detailed review of code quality, TS types, and architecture." > ${path.join(logDir, 'static-review.md')} 2>&1` },
    { id: 'feedback', name: 'Feedback Analysis', cmd: `node scripts/utils/fetch-pr-info.js ${prNumber} > ${path.join(logDir, 'comments.log')} 2>&1 && ${geminiBin} --policy ${policyPath} -p "Summarize the unresolved PR feedback in ${path.join(logDir, 'comments.log')}." > ${path.join(logDir, 'comments-summary.md')} 2>&1` },
    { id: 'proof', name: 'Behavioral Proof', dep: 'build', cmd: `${geminiBin} --policy ${policyPath} -p "Using the build logs in ${path.join(logDir, 'build.log')} and the diff in ${path.join(logDir, 'pr-diff.diff')}, physically exercise the new code in the terminal. Provide logs proving it works." > ${path.join(logDir, 'behavioral-proof.md')} 2>&1` }
  ]);

  await runner.runParallel();

  // 3. PHASE 2: Synthesis
  console.log('\n⏳ Synthesizing final assessment...');
  const synthesisCmd = `${geminiBin} --policy ${policyPath} -p "Merge the results from ${path.join(logDir, 'ci-status.md')}, ${path.join(logDir, 'static-review.md')}, ${path.join(logDir, 'comments-summary.md')}, and ${path.join(logDir, 'behavioral-proof.md')} into a final assessment for PR #${prNumber}. Indicate if the PR meets its goals as defined in ${path.join(logDir, 'mission-context.md')}." > ${path.join(logDir, 'final-assessment.md')} 2>&1`;
  
  const synthesisStatus = await runner.run(synthesisCmd);
  
  if (synthesisStatus === 0) {
    console.log(`\n✅ Final assessment complete: ${path.join(logDir, 'final-assessment.md')}`);
    // Trigger notification
    spawnSync('sh', ['-c', `printf "\\e]9;Review Complete | PR #${prNumber} | Final assessment ready.\\a"`]);
  }

  return synthesisStatus;
}

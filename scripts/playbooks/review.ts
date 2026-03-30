/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTaskRunner } from '../TaskRunner.js';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { LOCAL_BUNDLE_PATH, BUNDLE_PATH } from '../Constants.js';

export async function runReviewPlaybook(
  prNumber: string,
  targetDir: string,
  policyPath: string,
  geminiBin: string,
  logDir: string,
  missionHeader: string,
  guidelinesPath?: string,
) {
  const runner = createTaskRunner(logDir, missionHeader);

  // Resolve the effective bundle directory based on environment
  const isRemote =
    geminiBin.includes('docker') || process.env.GCLI_ORBIT_INSTANCE_NAME;
  const effectiveBundle = isRemote ? BUNDLE_PATH : LOCAL_BUNDLE_PATH;

  // Detect project type
  const hasPackageJson = fs.existsSync(path.join(targetDir, 'package.json'));

  // 1. PHASE 0: Parallel Context Acquisition
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
      // Fallback: if gh pr diff fails, use git diff against main
      cmd: `gh pr diff ${prNumber} || git diff origin/main...HEAD`,
      timeout: 60000,
    },
    {
      id: 'build',
      name: 'Single-Source Build',
      // Only build if it's a node project
      cmd: hasPackageJson
        ? `cd ${targetDir} && npm ci && npm run build`
        : `echo "Non-Node project detected. Skipping build."`,
      timeout: 600000,
    },
  ]);

  const contextStatus = await runner.runParallel();
  if (contextStatus !== 0) {
    console.warn(
      '⚠️ Phase 0 context acquisition had some failures. Proceeding with caution...',
    );
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
      path.join(targetDir, 'CONTRIBUTING.md'),
    ];
    const foundRulePaths = possibleRulePaths.filter((p) => fs.existsSync(p));
    if (foundRulePaths.length > 0) {
      rulesReference = `the repo-specific development guidelines in ${foundRulePaths.join(', ')}`;
    }
  }

  runner.register([
    {
      id: 'ci',
      name: 'CI Monitor',
      cmd: `node ${effectiveBundle}/utils/ci.mjs`,
      timeout: 300000,
    },
    {
      id: 'static',
      name: 'Static Standards',
      cmd: `${geminiBin} --policy ${policyPath} -p "Analyze the diff in ${path.join(logDir, 'diff.log')} against ${rulesReference} and the mission context in ${path.join(logDir, 'context.log')}. Provide a detailed review of code quality, TS types, and architecture."`,
      timeout: 600000,
    },
    {
      id: 'feedback',
      name: 'Feedback Analysis',
      cmd: `node ${effectiveBundle}/utils/fetch-pr-info.js ${prNumber} | ${geminiBin} --policy ${policyPath} -p "Summarize the unresolved PR feedback provided on stdin. If no feedback is provided, simply reply with 'No unresolved feedback' and exit immediately."`,
      timeout: 600000,
    },
    {
      id: 'proof',
      name: 'Behavioral Proof',
      dep: 'build',
      cmd: `${geminiBin} --policy ${policyPath} -p "Using the build logs in ${path.join(logDir, 'build.log')} and the diff in ${path.join(logDir, 'diff.log')}, physically exercise the new code in the terminal. Provide logs proving it works."`,
      timeout: 900000,
    },
  ]);

  const evalStatus = await runner.runParallel();

  // 3. PHASE 2: Synthesis
  console.log('\n⏳ Synthesizing final assessment...');
  const synthesisCmd = `${geminiBin} --policy ${policyPath} -p "Merge the results from ${path.join(logDir, 'ci.log')}, ${path.join(logDir, 'static.log')}, ${path.join(logDir, 'feedback.log')}, and ${path.join(logDir, 'proof.log')} into a final assessment for PR #${prNumber}. Indicate if the PR meets its goals as defined in ${path.join(logDir, 'context.log')}."`;

  const synthesisStatus = await runner.run(
    `${synthesisCmd} > ${path.join(logDir, 'final-assessment.md')} 2>&1`,
  );

  if (synthesisStatus === 0) {
    console.log(
      `\n✅ Final assessment complete: ${path.join(logDir, 'final-assessment.md')}`,
    );
    // Trigger notification
    spawnSync('sh', [
      '-c',
      `printf "\\e]9;Review Complete | PR #${prNumber} | Final assessment ready.\\a"`,
    ]);
  }

  return synthesisStatus !== 0 || evalStatus !== 0 ? 1 : 0;
}

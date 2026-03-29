/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTaskRunner } from '../TaskRunner.js';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';

export async function runImplementPlaybook(
  issueNumber: string,
  targetDir: string,
  policyPath: string,
  geminiBin: string,
  logDir: string,
  missionHeader: string,
  guidelinesPath?: string,
) {
  const runner = createTaskRunner(logDir, missionHeader);

  // 1. PHASE 0: Parallel Research & Context
  runner.register([
    {
      id: 'context',
      name: 'Deep Context Acquisition',
      cmd: `tsx scripts/utils/fetch-implement-context.ts ${issueNumber} ${logDir} ${geminiBin} ${policyPath}`,
      timeout: 300000,
    },
    {
      id: 'analysis',
      name: 'Codebase Analysis',
      cmd: `${geminiBin} --policy ${policyPath} -y -p "Analyze the codebase for areas relevant to Issue #${issueNumber}. Identify key files and dependencies. Record findings in codebase-analysis.md."`,
      timeout: 600000,
    },
  ]);

  const contextStatus = await runner.runParallel();
  if (contextStatus !== 0) {
    console.warn(
      '⚠️ Phase 0 research had some failures. Proceeding with caution...',
    );
  }

  const guidelinesReference = guidelinesPath
    ? ` and the explicit guidelines in ${guidelinesPath}`
    : '';

  // 2. PHASE 1: Mission Planning (Read-Only)
  console.log('\n📝 Phase 1: Planning...');
  const planningCmd = `${geminiBin} --policy ${policyPath} -p "Based on the Mission Context in ${path.join(logDir, 'context.log')}, the Codebase Analysis in ${path.join(logDir, 'analysis.log')}${guidelinesReference}, generate a detailed implementation plan. 
  Include:
  - Objective
  - Affected Files
  - Implementation Steps (in small chunks)
  - Verification Plan (Test-First)
  Save the plan to ${path.join(logDir, 'implementation-plan.md')}."`;

  const planningStatus = await runner.run(
    `${planningCmd} > ${path.join(logDir, 'planning.log')} 2>&1`,
  );
  if (planningStatus !== 0) return planningStatus;

  // 3. PHASE 2: Automated Critic Review & Revision Loop
  console.log('\n⚖️ Phase 2: Plan Review & Revision...');
  let planApproved = false;
  let planAttempts = 0;
  const maxPlanAttempts = 3;

  while (!planApproved && planAttempts < maxPlanAttempts) {
    planAttempts++;
    console.log(`   - Review Attempt ${planAttempts}/${maxPlanAttempts}...`);

    const criticCmd = `${geminiBin} --policy ${policyPath} -p "Review the implementation plan in ${path.join(logDir, 'implementation-plan.md')} against the requirements in ${path.join(logDir, 'context.log')}${guidelinesReference}. 
  Ensure it follows project guidelines and uses small, testable steps. 
  If it is perfect, reply ONLY with 'GO'. 
  Otherwise, provide specific feedback and reply with 'NO-GO' at the end."`;

    await runner.run(
      `${criticCmd} > ${path.join(logDir, `plan-review-v${planAttempts}.md`)} 2>&1`,
    );

    const reviewContent = fs.readFileSync(
      path.join(logDir, `plan-review-v${planAttempts}.md`),
      'utf8',
    );
    if (reviewContent.includes('GO') && !reviewContent.includes('NO-GO')) {
      planApproved = true;
      console.log('   ✅ Plan Approved!');
    } else {
      console.log('   ⚠️ Plan rejected by critic. Revising...');
      const revisionCmd = `${geminiBin} --policy ${policyPath} -p "Revise the implementation plan in ${path.join(logDir, 'implementation-plan.md')} based on this feedback:
  ${reviewContent}

  Save the updated plan to ${path.join(logDir, 'implementation-plan.md')}."`;
      await runner.run(
        `${revisionCmd} > ${path.join(logDir, 'revision.log')} 2>&1`,
      );
    }
  }

  if (!planApproved) {
    console.warn(
      '   ⚠️ Plan was not fully approved by critic after several attempts. Proceeding with caution.',
    );
  }

  // 4. PHASE 3: Sequential Implementation (Agentic Loop)
  console.log('\n🛠️ Phase 3: Implementation (Sequential Chunks)...');

  const executionPrompt = `Implement Issue #${issueNumber} according to the plan in ${path.join(logDir, 'implementation-plan.md')}. 
  FOLLOW THESE RULES:
  1. Work in small chunks (~10 minutes).
  2. TEST-FIRST: Create or update a repro test for the current chunk.
  3. Verify: Run the test and ensure it passes before moving to the next chunk.
  4. DO NOT skip verification.
  5. Record your progress in ${path.join(logDir, 'execution.log')}.`;

  const executionStatus = await runner.run(
    `${geminiBin} --policy ${policyPath} -p "${executionPrompt.replace(/"/g, '\\"')}" > ${path.join(logDir, 'execution.log')} 2>&1`,
  );
  if (executionStatus !== 0) return executionStatus;

  // 5. PHASE 4: Final Quality Control
  runner.register([
    { id: 'build', name: 'Final Build', cmd: `npm run build`, timeout: 600000 },
    {
      id: 'review',
      name: 'Local Code Review',
      cmd: `${geminiBin} --policy ${policyPath} -p "Review the final implementation against the Mission Context in ${path.join(logDir, 'context.log')}${guidelinesReference}. Check for quality, adherence to guidelines, and completeness. Record in ${path.join(logDir, 'local-review.md')}."`,
      timeout: 600000,
    },
    {
      id: 'proof',
      name: 'Behavioral Proof',
      cmd: `${geminiBin} --policy ${policyPath} -p "Physically exercise the new implementation in the terminal. Provide logs proving it works."`,
      timeout: 900000,
    },
  ]);

  const qcStatus = await runner.runParallel();

  // 6. PHASE 5: Synthesis & PR Prep
  console.log('\n✨ Synthesizing final results...');
  const synthesisCmd = `${geminiBin} --policy ${policyPath} -p "Merge the implementation results from ${path.join(logDir, 'execution.log')}, ${path.join(logDir, 'review.log')}, and ${path.join(logDir, 'proof.log')} into a final assessment. Then, prepare a Pull Request description based on this work. Save to ${path.join(logDir, 'final-assessment.md')}."`;

  const finalStatus = await runner.run(
    `${synthesisCmd} > ${path.join(logDir, 'final-assessment.md')} 2>&1`,
  );

  if (finalStatus === 0) {
    console.log(
      `\n✅ Implementation complete! Final assessment ready at: ${path.join(logDir, 'final-assessment.md')}`,
    );
    spawnSync('sh', [
      '-c',
      `printf "\\e]9;Implementation Complete | Issue #${issueNumber} | Final assessment ready.\\a"`,
    ]);
  }

  return finalStatus !== 0 ||
    contextStatus !== 0 ||
    executionStatus !== 0 ||
    qcStatus !== 0
    ? 1
    : 0;
}

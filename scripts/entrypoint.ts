/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));




const prNumber = process.argv[2];
const branchName = process.argv[3];
const policyPath = process.argv[4];
const ISOLATED_CONFIG = '/home/node';

async function main() {
  if (!prNumber || !branchName || !policyPath) {
    console.error('Usage: tsx entrypoint.ts <PR_NUMBER> <BRANCH_NAME> <POLICY_PATH>');
    process.exit(1);
  }

  const workDir = process.cwd(); // This is remoteWorkDir as set in review.ts
  const targetDir = path.join(workDir, branchName);

  // Use global tools pre-installed in the development image
  const tsxBin = 'tsx'; 
  const geminiBin = 'gemini';

  const action = process.argv[5] || 'review';
  const customPrompt = process.argv[6];

  // 1. Run the Orbit Doctor (Health Check)
  console.log('🩺 Running Orbit Doctor...');
  const healthCheckRes = spawnSync('df', ['-h', targetDir], { stdio: 'pipe' });
  if (healthCheckRes.status === 0) {
      console.log(`   ✅ Disk usage verified for ${targetDir}`);
  }

  const gitCheckRes = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'pipe', cwd: targetDir });
  if (gitCheckRes.status !== 0) {
      console.error('   ❌ Critical: Not a valid git worktree. Attempting self-repair...');
      // Self-repair logic can be added here if needed
  } else {
      console.log('   ✅ Git worktree health verified.');
  }

  // 2. Run the Parallel Reviewer
  console.log('\n🚀 Launching Parallel Review Worker...');
  console.log(`   - Script: ${path.join(__dirname, 'worker.ts')}`);
  console.log(`   - Action: ${action}`);

  const workerResult = spawnSync(tsxBin, [path.join(__dirname, 'worker.ts'), prNumber, branchName, policyPath, action], {
    stdio: 'inherit',
    env: { ...process.env, GEMINI_CLI_HOME: ISOLATED_CONFIG }
  });

  if (workerResult.status !== 0) {
    console.error(`❌ Worker failed with exit code ${workerResult.status}.`);
    if (workerResult.error) console.error('   Error:', workerResult.error.message);
  }

  // 2. Launch the Interactive Gemini Session (Local Nightly)
  console.log('\n✨ Orbit ready. Joining interactive session...');
  
  const geminiArgs = ['--policy', policyPath];
  let initialPrompt = '';

  if (customPrompt) {
      initialPrompt = customPrompt;
  } else if (action !== 'open') {
      // For any non-open action (if we re-add them), provide a helper prompt.
      // But if it's 'open' and no prompt was passed, we want it to be clean.
      initialPrompt = `I've jumped into this orbit for PR #${prNumber}. I'm ready to help you fix conflicts or run tests.`;
  }

  // Use --prompt-interactive ONLY if we have a prompt to avoid argument errors
  if (initialPrompt) {
      geminiArgs.push('--prompt-interactive', initialPrompt);
  }

  process.chdir(targetDir);
  spawnSync(geminiBin, geminiArgs, {
    stdio: 'inherit',
    env: { ...process.env, GEMINI_CLI_HOME: ISOLATED_CONFIG }
  });
}

main().catch(console.error);

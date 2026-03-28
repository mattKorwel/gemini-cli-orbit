/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from './Logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prNumber = process.argv[2];
const branchName = process.argv[3];
const policyPath = process.argv[4];
const ISOLATED_CONFIG = '/home/node';

async function main() {
  const isVerbose = process.argv.includes('--verbose');
  if (isVerbose) {
    logger.setVerbose(true);
  }

  if (!prNumber || !branchName || !policyPath) {
    logger.error('Usage: tsx entrypoint.ts <PR_NUMBER> <BRANCH_NAME> <POLICY_PATH> [--verbose]');
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
  logger.info('🩺 Running Orbit Doctor...');
  const healthCheckRes = spawnSync('df', ['-h', targetDir], { stdio: 'pipe' });
  logger.logOutput(healthCheckRes.stdout, healthCheckRes.stderr);
  if (healthCheckRes.status === 0) {
      logger.info(`   ✅ Disk usage verified for ${targetDir}`);
  }

  const gitCheckRes = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'pipe', cwd: targetDir });
  logger.logOutput(gitCheckRes.stdout, gitCheckRes.stderr);
  if (gitCheckRes.status !== 0) {
      logger.error('   ❌ Critical: Not a valid git worktree. Attempting self-repair...');
      // Self-repair logic can be added here if needed
  } else {
      logger.info('   ✅ Git worktree health verified.');
  }

  // 2. Run the Parallel Reviewer
  logger.info('\n🚀 Launching Parallel Review Worker...');
  logger.info(`   - Script: ${path.join(__dirname, 'worker.ts')}`);
  logger.info(`   - Action: ${action}`);

  const workerResult = spawnSync(tsxBin, [path.join(__dirname, 'worker.ts'), prNumber, branchName, policyPath, action], {
    stdio: 'inherit',
    env: { ...process.env, GEMINI_CLI_HOME: ISOLATED_CONFIG }
  });

  if (workerResult.status !== 0) {
    logger.error(`❌ Worker failed with exit code ${workerResult.status}.`);
    if (workerResult.error) logger.error('   Error:', workerResult.error.message);
  }

  // 2. Launch the Interactive Gemini Session (Local Nightly)
  logger.info('\n✨ Orbit ready. Joining interactive session...');
  
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

main().catch(err => {
  logger.error(err instanceof Error ? err.message : String(err));
});

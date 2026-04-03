/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';

import { ProviderFactory } from '../providers/ProviderFactory.js';
import {
  getRepoConfig,
  detectRepoName,
  sanitizeName,
  resolveContextBundles,
} from './ConfigManager.js';

export async function runChecker(
  args: string[],
  _env: NodeJS.ProcessEnv = process.env,
) {
  const identifier = args[0];
  if (!identifier) {
    console.error('Usage: orbit check <IDENTIFIER>');
    return 1;
  }

  const repoRoot = process.cwd();
  const repoName = detectRepoName(repoRoot);
  const config = getRepoConfig(repoName, undefined, repoRoot);

  if (!config) {
    console.error(
      `❌ Settings not found for repo: ${repoName}. Run "orbit setup" first.`,
    );
    return 1;
  }

  const bundles = resolveContextBundles(repoRoot, config);
  const { instanceName } = bundles.infra;
  const provider = ProviderFactory.getProvider(bundles.project, bundles.infra);

  const action = 'review';
  const sId = sanitizeName(identifier);
  const containerName = `orbit-${sId}-${action}`;

  console.log(
    `🔍 Checking remote status for ${identifier} on ${instanceName}...`,
  );

  const branchView = spawnSync(
    'gh',
    ['pr', 'view', identifier, '--json', 'headRefName', '-q', '.headRefName'],
    { shell: true },
  );
  let branchName = branchView.stdout.toString().trim();
  if (!branchName || branchName === 'undefined') {
    // If pr view fails, assume identifier IS the branch name
    branchName = identifier;
  }
  const logDir = `${bundles.infra.remoteWorkDir}/${branchName}/.gemini/logs/review-${identifier}`;

  const tasks = ['build', 'ci', 'review', 'verify'];
  let allDone = true;

  console.log('\n--- Task Status ---');
  for (const task of tasks) {
    const exitFile = `${logDir}/${task}.exit`;
    const checkExit = await provider.getExecOutput(
      `[ -f ${exitFile} ] && cat ${exitFile}`,
      { wrapCapsule: containerName },
    );

    if (checkExit.status === 0 && checkExit.stdout.trim()) {
      const code = checkExit.stdout.trim();
      console.log(
        `  ${code === '0' ? '✅' : '❌'} ${task.padEnd(10)}: ${code === '0' ? 'SUCCESS' : `FAILED (exit ${code})`}`,
      );
    } else {
      const checkRunning = await provider.exec(`[ -f ${logDir}/${task}.log ]`, {
        wrapCapsule: containerName,
      });
      if (checkRunning === 0) {
        console.log(`  ⏳ ${task.padEnd(10)}: RUNNING`);
      } else {
        console.log(`  💤 ${task.padEnd(10)}: PENDING`);
      }
      allDone = false;
    }
  }

  if (allDone) {
    console.log(
      '\n✨ All remote tasks complete. You can now synthesize the results.',
    );
  } else {
    console.log(
      '\n⏳ Some tasks are still in progress. Check again in a few minutes.',
    );
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runChecker(process.argv.slice(2)).catch(console.error);
}

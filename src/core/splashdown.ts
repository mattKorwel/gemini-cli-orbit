/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderFactory } from '../providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import readline from 'node:readline';

/**
 * Splashdown: Emergency shutdown of all active capsules and/or stations.
 */
export async function runSplashdown(args: string[]) {
  const all = args.includes('--all');
  const forceLocalCleanup = args.includes('--force-local-cleanup-i-undestand');
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);

  const isLocal =
    !config.projectId ||
    config.projectId === 'local' ||
    (config.providerType as any) === 'local-worktree';

  if (forceLocalCleanup) {
    if (!isLocal) {
      console.error(
        '❌ Error: --force-local-cleanup can only be used in local mode.',
      );
      return 1;
    }

    console.log('\n' + '!'.repeat(80));
    console.log('!!! NUCLEAR OPTION: LOCAL WORKTREE PURGE !!!'.padStart(60));
    console.log('!'.repeat(80));
    console.log(
      `\nWARNING: This will IRREVERSIBLY DELETE all sibling worktrees for repository:`,
    );
    console.log(`         [ ${repoName} ]`);
    console.log('\nANY UNCOMMITTED CHANGES IN THOSE WORKTREES WILL BE LOST.');
    console.log('!'.repeat(80) + '\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (query: string): Promise<string> =>
      new Promise((resolve) => rl.question(query, resolve));

    try {
      const confirm1 = await question(
        'Are you absolutely sure you want to proceed? (yes/N): ',
      );
      if (confirm1.toLowerCase() !== 'yes') {
        console.log('Aborted.');
        rl.close();
        return 0;
      }

      const confirm2 = await question(
        `Type the repository name "${repoName}" to confirm nuclear purge: `,
      );
      if (confirm2 !== repoName) {
        console.log('Confirmation mismatch. Aborted.');
        rl.close();
        return 0;
      }
    } finally {
      rl.close();
    }

    console.log('\n🚀 Initiating local worktree purge...');
  }

  const instanceName = config.instanceName || 'local';
  const provider = ProviderFactory.getProvider({
    ...config,
    projectId: config.projectId || 'local',
    zone: config.zone || 'local',
    instanceName,
  });

  console.log(`🌊 Orbit Splashdown: Decommissioning missions...`);

  const capsules = await provider.listCapsules();
  if (capsules.length === 0) {
    console.log('✅ No active mission capsules found.');
  } else {
    for (const capsule of capsules) {
      // Never wipe the 'main' folder locally
      if (isLocal && (capsule === 'main' || capsule === 'primary')) continue;

      console.log(`🔥 Jettisoning: ${capsule}...`);
      await provider.removeCapsule(capsule);
    }
    console.log('✅ All mission capsules decommissioned.');
  }

  if (all) {
    if (isLocal) {
      console.log('ℹ️ Station shutdown is a no-op in local mode.');
    } else {
      console.log(`🚀 Terminating Orbit Station: ${instanceName}...`);
      await provider.stop();
      console.log('✅ Station shutdown initiated.');
    }
  }

  return 0;
}

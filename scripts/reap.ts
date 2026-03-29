/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import readline from 'node:readline';
import { ProviderFactory } from './providers/ProviderFactory.js';
import { detectRepoName, getRepoConfig } from './ConfigManager.js';
import { runSplashdown } from './splashdown.js';

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`❓ ${question} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

export async function runReap(env: NodeJS.ProcessEnv = process.env) {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  
  if (!config) {
    console.error(`❌ Settings not found for repo: ${repoName}.`);
    return 1;
  }

  const provider = ProviderFactory.getProvider(config as any);
  const statusRes = await provider.getStatus();
  
  if (statusRes.status !== 'RUNNING') {
      console.log(`📡 Station ${provider.stationName} is not running. Nothing to reap.`);
      return 0;
  }

  const capsules = await provider.listCapsules();
  if (capsules.length === 0) {
      console.log('✅ No active mission capsules found.');
      return 0;
  }

  const args = process.argv.slice(2);
  const thresholdHours = parseInt(args.find(a => a.startsWith('--threshold='))?.split('=')[1] || '4');
  const thresholdSeconds = thresholdHours * 3600;
  const force = args.includes('--force');

  console.log(`\n🧹 ORBIT AUTO-REAPER (Threshold: ${thresholdHours}h)`);
  console.log(`--------------------------------------------------------------------------------`);

  const toReap: string[] = [];
  for (const name of capsules) {
      const idleTime = await provider.getCapsuleIdleTime(name);
      const isIdle = idleTime > thresholdSeconds;
      
      const statusStr = isIdle ? '⚠️  IDLE' : '✅ ACTIVE';
      console.log(`   ${statusStr.padEnd(10)} ${name.padEnd(25)} | Idle: ${formatDuration(idleTime)}`);
      
      if (isIdle) {
          toReap.push(name);
      }
  }

  if (toReap.length === 0) {
      console.log(`\n✨ All capsules are within activity threshold. No reaping needed.`);
      console.log(`--------------------------------------------------------------------------------\n`);
      return 0;
  }

  console.log(`--------------------------------------------------------------------------------`);
  console.log(`\nFound ${toReap.length} idle capsule(s).`);

  if (force || await confirm(`Jettison all idle capsules?`)) {
      for (const name of toReap) {
          console.log(`   - Jettisoning ${name}...`);
          // Extract PR number from name (gcli-<pr>-<action>)
          const parts = name.split('-');
          const prNumber = parts[1];
          
          if (prNumber) {
            // We can't easily call jettison.ts directly as a function if it's not exported
            // but we can use the provider directly.
            await provider.removeCapsule(name);
            // Worktree cleanup would require knowing the exact path, 
            // but removing the capsule is the primary resource reclaim.
            console.log(`     ✅ Capsule removed.`);
          }
      }
      
      // Post-reap station check
      const remaining = await provider.listCapsules();
      if (remaining.length === 0) {
          console.log(`\n📊 All capsules have been removed. The station is now empty.`);
          if (force || await confirm(`Would you like to splashdown the host station to save costs?`)) {
              await runSplashdown([], env);
          }
      }
  }

  console.log(`\n--------------------------------------------------------------------------------\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runReap().then(code => process.exit(code || 0)).catch(err => {
      console.error(err);
      process.exit(1);
  });
}

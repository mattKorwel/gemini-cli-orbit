/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import readline from 'node:readline';
import { ProviderFactory } from './providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import {
  ORBIT_ROOT,
  SATELLITE_WORKTREES_PATH,
  CONFIG_DIR,
} from './Constants.js';

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function runSplashdown(
  args: string[],
  _env: NodeJS.ProcessEnv = process.env,
) {
  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);

  if (!config) {
    console.error(
      `❌ Settings not found for repo: ${repoName}. Run "orbit liftoff" first.`,
    );
    return 1;
  }

  const { projectId, zone, dnsSuffix, userSuffix, backendType, instanceName } =
    config;
  const provider = ProviderFactory.getProvider({
    projectId: projectId!,
    zone: zone!,
    instanceName: instanceName!,
    repoName,
    dnsSuffix,
    userSuffix,
    backendType,
  });

  // --- Bulk Cleanup ---
  const isGlobal = args.includes('--all');
  console.log(
    `⚠️  DANGER: You are about to initiate a ${isGlobal ? 'GLOBAL MISSION SPLASHDOWN' : 'REPOSITORY RESET'} on ${instanceName}.`,
  );
  const confirmed = await confirm(
    `   "I'm sorry, ${process.env.USER || 'Dave'}. I'm afraid I can't do that... unless you are certain."\n   Are you sure you want to kill ALL sessions and worktrees for ${isGlobal ? 'THE ENTIRE CONSTELLATION' : config.repoName}?`,
  );
  if (!confirmed) {
    console.log('❌ Splashdown cancelled.');
    return 0;
  }

  console.log(
    `🧹 Starting ${isGlobal ? 'GLOBAL' : 'REPOSITORY'} splashdown...`,
  );

  // 1. Standard Cleanup
  console.log('   - Terminating remote capsules...');
  const containerRes = await provider.getExecOutput(
    "sudo docker ps -a --format '{{.Names}}' | grep '^gcli-'",
    { quiet: true },
  );
  if (containerRes.status === 0 && containerRes.stdout.trim()) {
    const names = containerRes.stdout.trim().split('\n').join(' ');
    await provider.exec(`sudo docker rm -f ${names}`);
  }

  if (isGlobal) {
    console.log('   - Terminating global station supervisor...');
    await provider.exec(`sudo docker rm -f station-supervisor || true`);
  }

  console.log(
    `   - Clearing satellite worktrees for ${isGlobal ? 'ALL repos' : config.repoName}...`,
  );
  if (isGlobal) {
    await provider.exec(`sudo rm -rf ${SATELLITE_WORKTREES_PATH}/*`);
  } else {
    await provider.exec(
      `sudo rm -rf ${SATELLITE_WORKTREES_PATH}/${config.repoName}/*`,
    );
  }

  console.log('   - Clearing mission history and telemetry...');
  await provider.exec(`sudo rm -rf ${CONFIG_DIR}/history/*`);
  await provider.exec(`sudo rm -f ${CONFIG_DIR}/state.json`);

  console.log(
    `   - Wiping ${isGlobal ? 'ALL' : 'current'} repository mission clones...`,
  );
  if (isGlobal) {
    await provider.exec(`sudo rm -rf ${ORBIT_ROOT}/main/*`);
  } else {
    await provider.exec(`sudo rm -rf ${config.remoteWorkDir}`);
  }

  console.log('   - Pruning station Docker resources...');
  await provider.exec(`sudo docker system prune -af --volumes`);

  console.log(
    `✅ ${isGlobal ? 'Global station' : 'Repository ' + config.repoName} splashdown complete.`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSplashdown(process.argv.slice(2))
    .then((code) => process.exit(code || 0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

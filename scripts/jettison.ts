/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ProviderFactory } from './providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';
import { 
  SATELLITE_WORKTREES_PATH, 
  CONFIG_DIR,
} from './Constants.js';

export async function runJettison(
  args: string[],
  _env: NodeJS.ProcessEnv = process.env,
) {
  const prNumber = args[0];
  const actionArg = args[1] || 'open';

  if (!prNumber) {
    console.error('❌ Usage: jettison <PR_NUMBER> [action]');
    return 1;
  }

  const repoName = detectRepoName();
  const config = getRepoConfig(repoName);
  
  if (!config) {
    console.error(`❌ Settings not found for repo: ${repoName}. Run "orbit liftoff" first.`);
    return 1;
  }

  const { projectId, zone, dnsSuffix, userSuffix, backendType, instanceName } = config;
  const provider = ProviderFactory.getProvider({
    projectId: projectId!,
    zone: zone!,
    instanceName: instanceName!,
    repoName,
    dnsSuffix,
    userSuffix,
    backendType
  });

  const repoWorktreesDir = `${SATELLITE_WORKTREES_PATH}/${config.repoName}`;
  const worktreePath = `${repoWorktreesDir}/orbit-${prNumber}-${actionArg}`;
  const containerName = `gcli-${prNumber}-${actionArg}`;

  console.log(
    `🧹 Surgically jettisoning capsule and worktree for PR #${prNumber} in ${config.repoName}...`,
  );

  // 1. Remove the specific container (capsule)
  const res1 = await provider.removeCapsule(containerName);

  // 2. Remove specific worktree directory on host station
  const res2 = await provider.exec(`sudo rm -rf ${worktreePath}`);

  // 3. Clear history files for this mission on host station
  const res3 = await provider.exec(`sudo rm -rf ${CONFIG_DIR}/history/orbit-${prNumber}-${actionArg}*`);

  if (res1 !== 0 || res2 !== 0 || res3 !== 0) {
      console.error('❌ Jettison failed.');
      return 1;
  }

  console.log(`✅ Jettison complete for PR #${prNumber} in ${config.repoName}.`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runJettison(process.argv.slice(2)).then(code => process.exit(code || 0)).catch(err => {
      console.error(err);
      process.exit(1);
  });
}

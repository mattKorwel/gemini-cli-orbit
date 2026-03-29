/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ProviderFactory } from './providers/ProviderFactory.js';
import { getRepoConfig, detectRepoName } from './ConfigManager.js';

export async function runStatus(_env: NodeJS.ProcessEnv = process.env) {
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

  const statusRes = await provider.getStatus();
  if (statusRes.status === 'UNKNOWN' || statusRes.status === 'ERROR') {
    console.error(
      `❌ Station ${instanceName} is in an invalid state: ${statusRes.status}`,
    );
    return 1;
  }

  console.log(`\n🛰️  ORBIT MISSION CONTROL: ${instanceName} (${repoName})`);
  console.log(
    `--------------------------------------------------------------------------------`,
  );

  console.log(`   - Station State:  ${statusRes.status}`);
  console.log(`   - Internal IP:    ${statusRes.internalIp || 'N/A'}`);
  if (statusRes.externalIp) {
    console.log(`   - External IP:    ${statusRes.externalIp}`);
  }
  console.log(`   - Station Name:   ${provider.stationName}`);

  if (statusRes.status === 'RUNNING') {
    console.log(`\n📦 ACTIVE MISSION CAPSULES:`);

    // Find all containers starting with 'gcli-'
    const containers = await provider.listCapsules();

    if (containers.length > 0) {
      for (const containerName of containers) {
        const stats = await provider.getCapsuleStats(containerName);
        const tmuxRes = await provider.getExecOutput(
          'tmux list-sessions -F "#S" 2>/dev/null',
          { wrapCapsule: containerName, quiet: true },
        );

        let stateLabel = '💤 [IDLE]    ';
        if (tmuxRes.status === 0 && tmuxRes.stdout.trim()) {
          // HEURISTIC: Capture pane to see what's happening
          const paneOutput = await provider.capturePane(containerName);
          const lines = paneOutput.trim().split('\n');
          const lastLine = lines[lines.length - 1] || '';
          const lastTwoLines = lines.slice(-2).join(' ');

          // More robust waiting detection
          const isWaiting =
            lastLine.includes(' > ') || // Standard prompt
            lastLine.trim().endsWith('>') || // Minimal prompt
            lastTwoLines.includes('(y/n)') || // Approvals
            lastLine.trim().endsWith('?') || // Questions
            (lastLine.includes('node@') && lastLine.includes('$')); // Shell prompt

          if (isWaiting) {
            stateLabel = '✋ [WAITING] ';
          } else {
            stateLabel = '🧠 [THINKING]';
          }
        }

        console.log(
          `     ${stateLabel} ${containerName.padEnd(20)} | ${stats}`,
        );
      }
    } else {
      console.log('     - No mission capsules found');
    }
  }

  console.log(
    `--------------------------------------------------------------------------------\n`,
  );
  return 0;
}

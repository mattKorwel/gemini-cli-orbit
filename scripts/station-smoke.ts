/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type MissionManifest } from '../src/core/types.js';

async function main() {
  const missionId =
    process.argv[2] || `smoke-${Date.now().toString().slice(-4)}`;

  console.log(
    `🚀 Starfleet Smoke Test: Igniting mission '${missionId}' via direct API call...\n`,
  );

  const manifest: MissionManifest = {
    identifier: missionId,
    repoName: 'orbit-smoke-test',
    branchName: 'main',
    action: 'chat',
    workspaceName: `smoke-${missionId}`,
    workDir: `/mnt/disks/data/workspaces/smoke-${missionId}`,
    containerName: `orbit-${missionId}`,
    policyPath: '/mnt/disks/data/policies/workspace-policy.toml',
    sessionName: `smoke-${missionId}-chat`,
    upstreamUrl: 'https://github.com/google/gemini-cli.git',
    verbose: true,
  };

  try {
    console.log(`📡 Sending manifest to http://localhost:8080/missions...`);
    const res = await fetch('http://localhost:8080/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(manifest),
    });

    const data = await res.json();

    if (res.ok) {
      console.log('\n✨ API Response: ACCEPTED');
      console.log(JSON.stringify(data.receipt, null, 2));
      console.log(`\n✅ Mission ignited! Next steps:`);
      console.log(`   1. npm run mission:validate -- ${missionId}`);
      console.log(`   2. docker exec -it orbit-smoke-${missionId} tmux attach`);
    } else {
      console.error(`\n❌ API Error (${res.status}):`);
      console.error(data.message || data.error);
    }
  } catch (e: any) {
    console.error(`\n❌ Failed to talk to Supervisor: ${e.message}`);
    console.log(`   Did you run 'npm run starfleet:local'?`);
  }
}

main().catch(console.error);

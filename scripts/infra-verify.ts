/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigManager } from '../src/core/ConfigManager.js';
import { ProcessManager } from '../src/core/ProcessManager.js';
import path from 'node:path';
import { SCHEMATICS_DIR } from '../src/core/Constants.js';

async function main() {
  const schematicName = process.argv[2];
  const instanceName = process.argv[3];

  if (!schematicName || !instanceName) {
    console.error(
      '❌ Usage: npm run infra:verify <schematic-name> <instance-name>',
    );
    process.exit(1);
  }

  const pm = new ProcessManager();
  const cm = new ConfigManager();

  // 1. Load Schematic for Context
  const schematicPath = path.join(SCHEMATICS_DIR, `${schematicName}.json`);
  const config = cm.loadJson(schematicPath);
  if (!config) throw new Error(`Schematic not found: ${schematicPath}`);

  const project = config.projectId;
  const zone = config.zone;
  const host = `nic0.${instanceName}.${zone}.c.${project}.internal.gcpnode.com`;

  console.log(`🔍 Verifying Starfleet Station: ${instanceName} (${host})...`);

  // 2. Initialize SDK components
  const { GitExecutor } = await import('../src/core/executors/GitExecutor.js');
  const { DockerExecutor } =
    await import('../src/core/executors/DockerExecutor.js');
  const { SshExecutor } = await import('../src/core/executors/SshExecutor.js');
  const { TmuxExecutor } =
    await import('../src/core/executors/TmuxExecutor.js');
  const { NodeExecutor } =
    await import('../src/core/executors/NodeExecutor.js');
  const { GeminiExecutor } =
    await import('../src/core/executors/GeminiExecutor.js');
  const { StarfleetClient } = await import('../src/sdk/StarfleetClient.js');
  const { StarfleetProvider } =
    await import('../src/providers/StarfleetProvider.js');

  const executors = {
    git: new GitExecutor(pm),
    docker: new DockerExecutor(pm),
    ssh: new SshExecutor(pm),
    tmux: new TmuxExecutor(pm),
    node: new NodeExecutor(pm),
    gemini: new GeminiExecutor(pm),
  };

  const client = new StarfleetClient('http://localhost:8080');
  const provider = new StarfleetProvider(client, pm, executors as any, {
    projectId: project,
    zone: zone,
    stationName: instanceName,
  });

  // 3. Perform Deep Verification via SDK
  const observer = {
    onLog: (level: any, tag: string, message: string) => {
      console.log(`[${tag}] ${message}`);
    },
  };

  console.log('🧪 Starting SDK-level ignition verification...');
  const success = await provider.verifyIgnition(observer as any);

  if (success) {
    console.log('\n✅ Starfleet Station is fully operational.');
  } else {
    console.error('\n❌ Verification failed or timed out.');

    console.log(
      '\n📋 DIAGNOSTIC: Fetching Serial Port Output (Startup Logs)...',
    );
    const logs = await pm.run('gcloud', [
      'compute',
      'instances',
      'get-serial-port-output',
      instanceName,
      '--project',
      project,
      '--zone',
      zone,
    ]);

    const bootstrapLogs = logs.stdout
      .split('\n')
      .filter((l) => l.includes('Orbit:') || l.includes('Starfleet:'));
    if (bootstrapLogs.length > 0) {
      console.log('--- Relevant Startup Logs ---');
      bootstrapLogs.forEach((l) => console.log(`   ${l}`));
    }
    process.exit(1);
  }
}

main().catch(console.error);

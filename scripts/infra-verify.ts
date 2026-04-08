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
  const user = process.env.USER + '_google_com'; // Standard corporate pattern

  console.log(`🔍 Verifying Starfleet Station: ${instanceName} (${host})...`);

  // 2. Connectivity Test
  const sshCmd = (remoteCmd: string) => [
    '-i',
    '~/.ssh/google_compute_engine',
    '-o',
    'StrictHostKeyChecking=no',
    '-o',
    'UserKnownHostsFile=/dev/null',
    '-o',
    'ConnectTimeout=5',
    `${user}@${host}`,
    remoteCmd,
  ];

  console.log('📡 Testing SSH Connectivity...');
  const ping = await pm.run('ssh', sshCmd('echo pong'));
  if (ping.status !== 0) {
    console.error(
      '❌ SSH Connection Failed. Station might be down or unreachable.',
    );
    process.exit(1);
  }
  console.log('✅ SSH Connection established.');

  // 3. Check Filesystem
  console.log('📂 Checking Data Disk (/mnt/disks/data)...');
  const fsCheck = await pm.run('ssh', sshCmd('ls -F /mnt/disks/data'));
  const dirs = fsCheck.stdout.split('\n');
  const required = ['bin/', 'mirror/', 'workspaces/', 'project-configs/'];
  const missing = required.filter((r) => !dirs.includes(r));

  if (missing.length === 0) {
    console.log('✅ Filesystem layout is correct.');
  } else {
    console.warn(`⚠️  Filesystem incomplete. Missing: ${missing.join(', ')}`);
  }

  // 4. Check Docker Containers
  console.log('🧠 Checking Station Supervisor...');
  const dockerCheck = await pm.run(
    'ssh',
    sshCmd(
      'sudo docker ps --filter name=station-supervisor --format "{{.Status}}"',
    ),
  );
  if (dockerCheck.stdout.trim()) {
    console.log(
      `✅ Station Supervisor is RUNNING (${dockerCheck.stdout.trim()}).`,
    );
  } else {
    console.error('❌ Station Supervisor is MISSING or STOPPED.');

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

    // Look for Starfleet Bootstrap errors
    const bootstrapLogs = logs.stdout
      .split('\n')
      .filter((l) => l.includes('Orbit:') || l.includes('Starfleet:'));
    if (bootstrapLogs.length > 0) {
      console.log('--- Relevant Startup Logs ---');
      bootstrapLogs.forEach((l) => console.log(`   ${l}`));
    } else {
      console.log(
        'ℹ️  No Orbit-specific bootstrap logs found in first 100 lines.',
      );
    }
  }

  // 5. Check API Availability (Internal)
  console.log('🌐 Testing Supervisor API (localhost:8080)...');
  const apiCheck = await pm.run(
    'ssh',
    sshCmd('curl -s http://localhost:8080/health'),
  );
  if (apiCheck.status === 0 && apiCheck.stdout.includes('OK')) {
    console.log('✅ Supervisor API is responsive.');
  } else {
    console.error('❌ Supervisor API is UNREACHABLE from the host.');
  }
}

main().catch(console.error);

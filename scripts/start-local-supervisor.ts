/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

/**
 * Dynamically generates a local station config with absolute paths
 * and user-specific mounts (like ~/.gemini) before starting the supervisor.
 */
async function main() {
  const root = process.cwd();
  const home = os.homedir();
  const configPath = path.join(root, 'configs/station.local.json');
  const dynamicConfigPath = path.join(
    root,
    'orbit-test-run/station.dynamic.json',
  );

  const baseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  // Hydrate absolute paths for Docker stability on Mac
  const hydratedConfig = {
    ...baseConfig,
    manifestRoot: path.resolve(root, baseConfig.manifestRoot),
    storage: {
      workspacesRoot: path.resolve(root, baseConfig.storage.workspacesRoot),
      mirrorPath: path.resolve(root, baseConfig.storage.mirrorPath),
    },
    mounts: [
      ...baseConfig.mounts.map((m: any) => ({
        ...m,
        host: path.resolve(root, m.host),
      })),
      // CRITICAL: Mount local user config for trust and settings
      {
        host: path.join(home, '.gemini'),
        capsule: '/home/node/.gemini',
        readonly: true,
      },
      // Mount the local bundle so mission telemetry and hooks work
      {
        host: path.join(root, 'bundle'),
        capsule: '/usr/local/lib/orbit/bundle',
        readonly: true,
      },
    ],
  };

  fs.writeFileSync(dynamicConfigPath, JSON.stringify(hydratedConfig, null, 2));

  console.log(`🚀 Starting Local Supervisor with dynamic config...`);
  console.log(`   - Data:    ${hydratedConfig.storage.workspacesRoot}`);
  console.log(`   - Config:  ~/.gemini -> /home/node/.gemini (ro)`);

  const server = spawn(
    'node',
    ['bundle/orbit-server.js', `--config=${dynamicConfigPath}`],
    {
      stdio: 'inherit',
    },
  );

  server.on('exit', (code) => process.exit(code || 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { findDockerSocket } from '../src/utils/DockerUtils.js';

/**
 * Convenience wrapper to start the local Starfleet supervisor.
 * Bridges host Docker socket and calls the bundled server.
 */
async function main() {
  const root = process.cwd();
  const configPath = path.join(root, 'configs/station.local.json');

  console.log(`🚀 Starting Local Supervisor (Host Mode)...`);
  console.log(`   - Config: ${configPath}`);

  const isWin = os.platform() === 'win32';
  const dockerSocket = findDockerSocket();
  const dockerHost = isWin
    ? `npipe:////./pipe/docker_engine`
    : `unix://${dockerSocket}`;

  const server = spawn(
    'node',
    ['bundle/orbit-server.js', `--config=${configPath}`],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        DOCKER_HOST: dockerHost,
      },
    },
  );

  server.on('exit', (code) => process.exit(code || 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

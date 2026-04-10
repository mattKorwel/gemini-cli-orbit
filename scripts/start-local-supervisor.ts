/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import {
  findDockerSocket,
  findAvailablePort,
} from '../src/utils/DockerUtils.js';

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
  const selectedPort = await findAvailablePort(8080);
  const ghConfigDir =
    process.env.GH_CONFIG_DIR ||
    (process.platform === 'win32' && process.env.APPDATA
      ? path.join(process.env.APPDATA, 'GitHub CLI')
      : path.join(home, '.config', 'gh'));

  // Hydrate absolute paths for Docker stability
  const hydratedConfig = {
    ...baseConfig,
    port: selectedPort,
    manifestRoot: path.resolve(root, baseConfig.manifestRoot),
    storage: {
      workspacesRoot: path.resolve(root, baseConfig.storage.workspacesRoot),
      mirrorPath: path.resolve(root, baseConfig.storage.mirrorPath),
    },
    mounts: [
      ...baseConfig.mounts.map((m: any) => ({
        ...m,
        host:
          m.host === '~/.gemini'
            ? path.join(home, '.gemini')
            : m.host === '~/.config/gh'
              ? ghConfigDir
              : m.host.startsWith('./')
                ? path.resolve(root, m.host)
                : m.host,
      })),
      // CRITICAL: Mount local user config for trust and settings
      // Mount the local bundle so mission telemetry and hooks work
      {
        host: path.join(root, 'bundle'),
        capsule: '/usr/local/lib/orbit/bundle',
        readonly: true,
      },
    ],
  };

  fs.writeFileSync(dynamicConfigPath, JSON.stringify(hydratedConfig, null, 2));

  console.log(`🚀 Starting Local Supervisor (Host Mode)...`);
  console.log(`   - API:     http://localhost:${selectedPort}`);
  console.log(`   - Data:    ${hydratedConfig.storage.workspacesRoot}`);

  const isWin = os.platform() === 'win32';
  const dockerSocket = findDockerSocket();
  const dockerHost = isWin
    ? `npipe:////./pipe/docker_engine`
    : `unix://${dockerSocket}`;

  const server = spawn(
    'node',
    ['bundle/orbit-server.js', `--config=${dynamicConfigPath}`],
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

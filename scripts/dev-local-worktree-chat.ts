/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const providedId = process.argv[2];
  const missionId =
    providedId ||
    `dev-chat-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

  const res = spawnSync(
    'node',
    [
      path.join(root, 'bundle', 'orbit-cli.js'),
      '--repo-dir',
      root,
      'mission',
      'start',
      missionId,
      'chat',
      '--local',
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
      },
    },
  );

  process.exit(res.status ?? 1);
}

main();

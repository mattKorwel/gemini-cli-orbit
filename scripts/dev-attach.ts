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
  const missionId = process.argv[2];
  const action = process.argv[3] || 'chat';

  if (!missionId) {
    console.error('❌ Usage: npm run dev:attach -- <mission-id> [action]');
    process.exit(1);
  }

  const res = spawnSync(
    'node',
    [
      path.join(root, 'bundle', 'orbit-cli.js'),
      'mission',
      'attach',
      missionId,
      action,
      '--repo-dir',
      root,
      '--local-docker',
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

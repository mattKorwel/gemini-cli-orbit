/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function findContainerName(missionId: string): string | undefined {
  try {
    return execFileSync(
      'docker',
      ['ps', '--filter', `name=orbit-${missionId}`, '--format', '{{.Names}}'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
  } catch {
    return undefined;
  }
}

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
      'launch',
      missionId,
      'chat',
      '--local-docker',
      '--git-auth',
      'host-gh-config',
      '--gemini-auth',
      'env-chain',
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
      },
    },
  );

  const exitCode = res.status ?? 1;
  if (exitCode === 0) {
    process.exit(0);
  }

  const launchedContainer = findContainerName(missionId);
  if (launchedContainer) {
    console.log(
      '\n⚠️ Chat launched, but automatic attach failed in this shell.',
    );
    console.log(`   - mission: ${missionId}`);
    console.log(`   - container: ${launchedContainer}`);
    console.log(
      `   - attach manually from a real TTY: node bundle/orbit-cli.js --repo-dir ${root} mission attach ${missionId} chat`,
    );
    process.exit(0);
  }

  process.exit(exitCode);
}

main();

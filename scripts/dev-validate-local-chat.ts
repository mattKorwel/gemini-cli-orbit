/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function run(bin: string, args: string[]): string {
  return execFileSync(bin, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const missionId =
    process.argv[2] || `validate-chat-${Date.now().toString().slice(-6)}`;
  const doScorch = !process.argv.includes('--no-scorch');

  if (doScorch) {
    const scorch = spawnSync('npm', ['run', 'dev:scorch-local'], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if ((scorch.status ?? 1) !== 0) {
      process.exit(scorch.status ?? 1);
    }
  }

  const build = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if ((build.status ?? 1) !== 0) {
    process.exit(build.status ?? 1);
  }

  const launch = spawnSync('npm', ['run', 'dev:local-chat', '--', missionId], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if ((launch.status ?? 1) !== 0) {
    process.exit(launch.status ?? 1);
  }

  const statePath = path.join(
    root,
    'orbit-test-run',
    'workspaces',
    'gemini-cli-orbit',
    missionId,
    '.gemini',
    'orbit',
    'state.json',
  );

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !fs.existsSync(statePath)) {
    await sleep(500);
  }

  if (!fs.existsSync(statePath)) {
    throw new Error(`state.json not found at ${statePath}`);
  }

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const containerName = run('docker', [
    'ps',
    '--filter',
    `name=orbit-${missionId}`,
    '--format',
    '{{.Names}}',
  ])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!containerName) {
    throw new Error(`No running worker container found for ${missionId}`);
  }

  const sessionName = run('docker', [
    'exec',
    containerName,
    'tmux',
    'list-sessions',
    '-F',
    '#S',
  ])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.includes(missionId));

  if (!sessionName) {
    throw new Error(`No tmux session found for ${missionId}`);
  }

  const pane = run('docker', [
    'exec',
    containerName,
    'tmux',
    'capture-pane',
    '-pt',
    sessionName,
  ]);

  const looksInteractive =
    pane.includes('Type your message or @path/to/file') ||
    pane.includes('Shift+Tab to manual');

  console.log('\n✅ Local chat validation complete.');
  console.log(`   - mission: ${missionId}`);
  console.log(`   - container: ${containerName}`);
  console.log(`   - session: ${sessionName}`);
  console.log(`   - state: ${state.status}`);

  if (!looksInteractive) {
    console.log('\n--- pane capture ---\n');
    console.log(pane);
    throw new Error('Gemini UI prompt was not detected in the tmux pane.');
  }

  console.log(`   - gemini: interactive UI detected`);
}

main().catch((err: any) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});

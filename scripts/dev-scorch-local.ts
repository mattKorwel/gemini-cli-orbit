/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function runDocker(args: string[]): string {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error: any) {
    const stdout = error?.stdout?.toString?.() || '';
    return stdout.trim();
  }
}

function removeIfPresent(name: string): void {
  try {
    execFileSync('docker', ['rm', '-f', name], {
      stdio: 'ignore',
    });
  } catch {
    // ignore missing containers
  }
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const orbitRoot = path.join(root, 'orbit-test-run');
  const removeImages = process.argv.includes('--images');

  removeIfPresent('station-supervisor-local');

  const workerIds = runDocker(['ps', '-aq', '--filter', 'name=^orbit-'])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (workerIds.length > 0) {
    execFileSync('docker', ['rm', '-f', ...workerIds], {
      stdio: 'inherit',
    });
  }

  if (fs.existsSync(orbitRoot)) {
    for (const entry of fs.readdirSync(orbitRoot)) {
      fs.rmSync(path.join(orbitRoot, entry), {
        recursive: true,
        force: true,
      });
    }
  }

  fs.mkdirSync(path.join(orbitRoot, 'workspaces'), { recursive: true });
  fs.mkdirSync(path.join(orbitRoot, 'main'), { recursive: true });
  fs.mkdirSync(path.join(orbitRoot, 'manifests'), { recursive: true });

  if (removeImages) {
    try {
      execFileSync('docker', ['rmi', '-f', 'orbit-worker:local'], {
        stdio: 'inherit',
      });
    } catch {
      // ignore missing local image
    }
  }

  console.log('✅ Local Starfleet state cleared.');
  console.log(`   - supervisor: station-supervisor-local removed`);
  console.log(`   - workers: orbit-* containers removed`);
  console.log(`   - workspace: ${orbitRoot} reset`);
  if (removeImages) {
    console.log(`   - image: orbit-worker:local removed`);
  }
}

main();

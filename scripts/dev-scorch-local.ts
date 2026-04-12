/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

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

function killHostSupervisorIfPresent(): boolean {
  try {
    if (process.platform === 'win32') {
      const script = `
$count = 0
Get-CimInstance Win32_Process | ForEach-Object {
  if (
    $_.Name -match '^node(\\.exe)?$' -and
    $_.CommandLine -like '*orbit-server.js*' -and
    $_.CommandLine -like '*station.local.json*'
  ) {
    Stop-Process -Id $_.ProcessId -Force
    $count++
  }
}
Write-Output $count
`;

      const killed = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', script],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ).trim();

      return Number(killed) > 0;
    }

    const pids = execFileSync(
      'pgrep',
      ['-f', 'bundle/orbit-server.js.*configs/station.local.json'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (pids.length > 0) {
      execFileSync('kill', ['-9', ...pids], { stdio: 'ignore' });
      return true;
    }
  } catch {
    // ignore missing process or platform-specific command failures
  }

  return false;
}

function main() {
  const localDockerRoot = path.join(
    os.homedir(),
    '.gemini',
    'orbit',
    'stations',
    'local-docker',
  );
  const removeImages = process.argv.includes('--images');
  const killedHostSupervisor = killHostSupervisorIfPresent();

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

  if (fs.existsSync(localDockerRoot)) {
    for (const entry of fs.readdirSync(localDockerRoot)) {
      fs.rmSync(path.join(localDockerRoot, entry), {
        recursive: true,
        force: true,
      });
    }
  }

  fs.mkdirSync(path.join(localDockerRoot, 'workspaces'), { recursive: true });
  fs.mkdirSync(path.join(localDockerRoot, 'main'), { recursive: true });
  fs.mkdirSync(path.join(localDockerRoot, 'manifests'), { recursive: true });

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
  if (killedHostSupervisor) {
    console.log(`   - host supervisor: bundle/orbit-server.js stopped`);
  }
  console.log(`   - workers: orbit-* containers removed`);
  console.log(`   - workspace: ${localDockerRoot} reset`);
  if (removeImages) {
    console.log(`   - image: orbit-worker:local removed`);
  }
}

main();

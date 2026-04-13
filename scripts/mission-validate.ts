/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { type StationSupervisorConfig } from '../src/core/types.js';

async function main() {
  const missionId = process.argv[2];
  if (!missionId) {
    console.error(
      '❌ Please provide a mission ID: npm run mission:validate -- <id>',
    );
    process.exit(1);
  }

  console.log(
    `🔍 Starfleet Diagnostic: Validating Mission '${missionId}'...\n`,
  );

  // 1. Load Local Blueprint
  const blueprintPath = 'configs/station.local.json';
  if (!fs.existsSync(blueprintPath)) {
    console.error('❌ Local blueprint missing.');
    process.exit(1);
  }
  const config = JSON.parse(
    fs.readFileSync(blueprintPath, 'utf8'),
  ) as StationSupervisorConfig;
  console.log('✅ Blueprint loaded.');

  // 2. Ping Supervisor
  try {
    const res = await fetch(`http://localhost:${config.port}/health`);
    if (res.ok) {
      const health = await res.json();
      console.log(
        `✅ Supervisor is ALIVE on port ${config.port} (v${health.version}, Mode: ${health.mode}).`,
      );

      if (health.mode === 'prod' && config.isUnlocked) {
        console.warn(
          '⚠️  MISMATCH: Supervisor is in PROD mode, but blueprint expects DEV (unlocked).',
        );
      }
    } else {
      console.warn(`⚠️  Supervisor responded with status ${res.status}.`);
    }
  } catch (_e) {
    console.error(
      `❌ Supervisor is UNREACHABLE on port ${config.port}. Did you run 'npm run starfleet:local'?`,
    );
  }

  // 3. Check Docker Container
  try {
    const ps = execSync(
      `docker ps -a --filter "label=orbit-mission" --format "{{.Names}} {{.Status}}"`,
    )
      .toString()
      .trim();
    const lines = ps.split('\n');
    const match = lines.find((l) => l.includes(missionId));

    if (match) {
      const actualName = match.split(' ')[0];
      if (match.includes('Up')) {
        console.log(`✅ Container found and is RUNNING: ${actualName}`);
      } else {
        console.error(`❌ Container exists but is NOT running: ${actualName}`);
      }

      // 4. Check Mounts
      try {
        const mounts = JSON.parse(
          execSync(
            `docker inspect ${actualName} --format '{{json .Mounts}}'`,
          ).toString(),
        );
        const dataMount = mounts.find(
          (m: any) => m.Destination === '/mnt/disks/data',
        );
        if (dataMount) {
          console.log(
            `✅ Data mount verified: ${dataMount.Source} -> /mnt/disks/data`,
          );
        } else {
          console.error('❌ Missing /mnt/disks/data mount in container!');
        }
      } catch (_e) {
        console.error('❌ Failed to inspect container mounts.');
      }
    } else {
      console.error(
        `❌ No container found matching mission ID '${missionId}'.`,
      );
      console.log(`   (Checked labels: orbit-mission)`);
    }
  } catch (_e) {
    console.error('❌ Failed to talk to Docker.');
  }

  // 5. Check Manifest
  // We resolve the manifestRoot since it might be relative in the config
  const absManifestRoot = path.resolve(config.manifestRoot);
  const manifestPath = path.join(
    absManifestRoot,
    `orbit-manifest-${missionId}.json`,
  );
  if (fs.existsSync(manifestPath)) {
    console.log(`✅ Manifest found at ${manifestPath}.`);
  } else {
    console.error(`❌ Manifest MISSING at ${manifestPath}.`);
  }

  // 6. Check Mission State (The most important behavioral signal)
  try {
    const absWorkspacesRoot = path.resolve(config.storage.workspacesRoot);
    const workspaces = fs.readdirSync(absWorkspacesRoot);
    const missionFolder = workspaces.find((w) => w.includes(missionId));
    if (missionFolder) {
      const statePath = path.join(
        absWorkspacesRoot,
        missionFolder,
        '.gemini/orbit/state.json',
      );
      if (fs.existsSync(statePath)) {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        console.log(`✅ state.json found. Current Status: [${state.status}]`);
      } else {
        console.warn('⚠️  state.json not yet created in workspace.');
      }
    } else {
      console.error(
        `❌ Mission workspace folder containing '${missionId}' not found in ${absWorkspacesRoot}.`,
      );
    }
  } catch (_e) {
    console.error('❌ Failed to check mission state on disk.');
  }

  console.log('\n✨ Diagnostic complete.');
}

main().catch(console.error);

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { StarfleetHarness } from '../test/StarfleetHarness.js';

describe('Personal GCP Prepare Behavior', () => {
  let harness: StarfleetHarness;
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  );
  const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  beforeEach(() => {
    harness = new StarfleetHarness('PersonalGcpPrepare');
  });

  afterEach(() => {
    harness.cleanup();
  });

  it('enables APIs, creates the default SSH key, registers it, and saves a schematic', async () => {
    const home = harness.resolve('home');
    const appData = path.join(home, 'AppData', 'Roaming');
    fs.mkdirSync(appData, { recursive: true });
    const gcloudScriptPath = path.join(harness.bin, 'gcloud.js');
    const sshKeygenScriptPath = path.join(harness.bin, 'ssh-keygen.js');

    fs.writeFileSync(
      gcloudScriptPath,
      `
const fs = require('node:fs');
const args = process.argv.slice(2);
const historyFile = ${JSON.stringify(harness.historyFile)};
fs.appendFileSync(historyFile, '[gcloud] ' + args.join(' ') + '\\n');
const joined = args.join(' ');

if (joined === '--version') {
  process.stdout.write('Google Cloud SDK 999.0.0\\n');
  process.exit(0);
}
if (joined === 'auth list --format=json') {
  process.stdout.write(JSON.stringify([{ account: 'matt.korwel@gmail.com', status: 'ACTIVE' }]));
  process.exit(0);
}
if (joined === 'config get-value account --quiet') {
  process.stdout.write('matt.korwel@gmail.com\\n');
  process.exit(0);
}
if (joined === 'config get-value project --quiet') {
  process.stdout.write('ai-01-492020\\n');
  process.exit(0);
}
if (joined === 'auth application-default print-access-token') {
  process.stdout.write('token-123\\n');
  process.exit(0);
}
if (joined === 'billing projects describe ai-01-492020 --format=json') {
  process.stdout.write(JSON.stringify({ billingEnabled: true }));
  process.exit(0);
}
if (joined === 'services list --enabled --project ai-01-492020 --format=value(config.name)') {
  process.stdout.write('iam.googleapis.com\\n');
  process.exit(0);
}
if (joined === 'services enable compute.googleapis.com oslogin.googleapis.com --project ai-01-492020') {
  process.exit(0);
}
if (joined === 'projects get-iam-policy ai-01-492020 --format=json') {
  process.stdout.write(JSON.stringify({
    bindings: [{ role: 'roles/compute.osAdminLogin', members: ['user:matt.korwel@gmail.com'] }],
  }));
  process.exit(0);
}
if (joined === 'compute os-login describe-profile --project ai-01-492020 --format=json') {
  process.stdout.write(JSON.stringify({
    posixAccounts: [
      {
        accountId: 'ai-01-492020',
        primary: true,
        username: 'matt_korwel_gmail_com',
      },
    ],
    loginProfile: { sshPublicKeys: {} },
  }));
  process.exit(0);
}
if (args[0] === 'compute' && args[1] === 'os-login' && args[2] === 'ssh-keys' && args[3] === 'add') {
  process.exit(0);
}
process.exit(0);
`,
      { mode: 0o755 },
    );

    fs.writeFileSync(
      path.join(harness.bin, 'gcloud.cmd'),
      `@echo off\r\n"${process.execPath}" "${gcloudScriptPath}" %*\r\n`,
    );

    fs.writeFileSync(
      sshKeygenScriptPath,
      `
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const historyFile = ${JSON.stringify(harness.historyFile)};
fs.appendFileSync(historyFile, '[ssh-keygen] ' + args.join(' ') + '\\n');

if (args[0] === '--version') {
  process.stdout.write('OpenSSH_for_Windows_9.0p1\\n');
  process.exit(0);
}

const keyPath = args[args.indexOf('-f') + 1];
fs.mkdirSync(path.dirname(keyPath), { recursive: true });
fs.writeFileSync(keyPath, 'private');
fs.writeFileSync(keyPath + '.pub', 'ssh-rsa AAA test-key');
process.exit(0);
`,
      { mode: 0o755 },
    );

    fs.writeFileSync(
      path.join(harness.bin, 'ssh-keygen.cmd'),
      `@echo off\r\n"${process.execPath}" "${sshKeygenScriptPath}" %*\r\n`,
    );

    const result = spawnSync(
      process.execPath,
      [
        tsxCli,
        path.join(repoRoot, 'scripts', 'gcp-prepare-personal.ts'),
        '--apply',
        '--schematic',
        'personal-gcp',
        '--zone',
        'us-central1-a',
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          APPDATA: appData,
          GCLI_ORBIT_PUBLIC_IP: '198.51.100.24',
          PATH: `${harness.bin}${path.delimiter}${process.env.PATH || ''}`,
        },
        encoding: 'utf8',
      },
    );

    const history = harness.getHistory().join('\n').replaceAll('\\', '/');
    if (result.status !== 0) {
      throw new Error(
        `script failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    }

    const savedPathMatch = result.stdout.match(
      /Saved recommended schematic to ([^\r\n]+?\.json)/,
    );
    const schematicPath =
      savedPathMatch?.[1] ||
      path.join(home, '.gemini', 'orbit', 'schematics', 'personal-gcp.json');
    const schematic = JSON.parse(fs.readFileSync(schematicPath, 'utf8'));

    expect(
      fs.existsSync(path.join(home, '.ssh', 'google_compute_engine')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(home, '.ssh', 'google_compute_engine.pub')),
    ).toBe(true);
    expect(schematic).toEqual({
      projectId: 'ai-01-492020',
      zone: 'us-central1-a',
      networkAccessType: 'external',
      useDefaultNetwork: true,
      manageFirewallRules: true,
      machineType: 'n2-standard-8',
      sshSourceRanges: ['198.51.100.24/32'],
      sshUser: 'matt_korwel_gmail_com',
    });
    expect(history).toContain(
      '[gcloud] services enable compute.googleapis.com oslogin.googleapis.com --project ai-01-492020',
    );
    expect(history).toContain(
      '[gcloud] compute os-login ssh-keys add --project ai-01-492020 --key-file',
    );
  });
});

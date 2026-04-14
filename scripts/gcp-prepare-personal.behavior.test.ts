/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StarfleetHarness } from '../src/test/StarfleetHarness.js';

let activeBinDir = '';

vi.mock('../src/core/ProcessManager.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/core/ProcessManager.js')
  >('../src/core/ProcessManager.js');
  const testActual = await vi.importActual<
    typeof import('../src/test/TestProcessManager.js')
  >('../src/test/TestProcessManager.js');

  class BehaviorProcessManager extends testActual.TestProcessManager {
    constructor(defaultOptions: any = {}, useSudo = false) {
      super(new actual.ProcessManager(defaultOptions, useSudo), {
        binDir: activeBinDir,
      });
    }

    static runSync(bin: string, args: string[], options: any = {}) {
      return new BehaviorProcessManager().runSync(bin, args, options);
    }

    static runAsync(bin: string, args: string[], options: any = {}) {
      return new BehaviorProcessManager().runAsync(bin, args, options);
    }
  }

  return {
    ...actual,
    ProcessManager: BehaviorProcessManager,
  };
});

describe('Personal GCP Prepare Behavior', () => {
  let harness: StarfleetHarness;

  beforeEach(() => {
    harness = new StarfleetHarness('PersonalGcpPrepare');
    const home = harness.resolve('home');
    activeBinDir = harness.bin;
    vi.spyOn(os, 'homedir').mockReturnValue(home);
  });

  afterEach(() => {
    activeBinDir = '';
    vi.resetModules();
    vi.unstubAllEnvs();
    harness.cleanup();
  });

  it('enables APIs, creates the default SSH key, registers it, and saves a schematic', async () => {
    const home = os.homedir();
    const appData = path.join(home, 'AppData', 'Roaming');
    fs.mkdirSync(appData, { recursive: true });
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    vi.stubEnv('APPDATA', appData);

    harness.stubScript(
      'gcloud.cmd',
      `
const joined = args.join(' ');

if (joined === '--version') {
  process.stdout.write('Google Cloud SDK 999.0.0\\n');
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

if (joined === 'compute os-login describe-profile --format=json') {
  process.stdout.write(JSON.stringify({ loginProfile: { sshPublicKeys: {} } }));
  process.exit(0);
}

if (args[0] === 'compute' && args[1] === 'os-login' && args[2] === 'ssh-keys' && args[3] === 'add') {
  process.exit(0);
}

process.exit(0);
`,
    );

    harness.stubScript(
      'ssh-keygen.exe',
      `
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
    );

    const { runPersonalGcpPrepare } = await import('./gcp-prepare-personal.ts');
    const exitCode = await runPersonalGcpPrepare([
      '--apply',
      '--schematic',
      'personal',
      '--zone',
      'us-central1-a',
    ]);

    const history = harness.getHistory().join('\n').replaceAll('\\', '/');
    const schematicPath = path.join(
      home,
      '.gemini',
      'orbit',
      'schematics',
      'personal.json',
    );
    const schematic = JSON.parse(fs.readFileSync(schematicPath, 'utf8'));

    expect(exitCode).toBe(0);
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
    });
    expect(history).toContain(
      'gcloud.cmd services enable compute.googleapis.com oslogin.googleapis.com --project ai-01-492020',
    );
    expect(history).toContain(
      'gcloud.cmd compute os-login ssh-keys add --key-file',
    );
  });
});

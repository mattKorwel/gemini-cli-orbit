/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProcessManager } from '../src/core/ProcessManager.js';

type Status = 'PASS' | 'WARN' | 'FAIL';

interface CheckResult {
  name: string;
  status: Status;
  detail: string;
}

interface Options {
  apply: boolean;
  projectId?: string;
  zone?: string;
  schematicName?: string;
  machineType: string;
}

interface ResolvedCommand {
  bin: string;
  viaCmd: boolean;
}

const REQUIRED_SERVICES = ['compute.googleapis.com', 'oslogin.googleapis.com'];

function printHelp() {
  console.log(`Usage: tsx scripts/gcp-prepare-personal.ts [options]

Preflight and optionally prepare the current lowest-friction personal GCP path
for Orbit remote stations using public IP + raw SSH.

Options:
  --project <id>        Override the active gcloud project
  --zone <zone>         Zone to save into the schematic (default: us-central1-a)
  --schematic <name>    Save a recommended external/default-network schematic (default: personal)
  --machine-type <t>    Machine type for the saved schematic (default: n2-standard-8)
  --apply               Enable missing APIs, generate/register SSH key, and save schematic
  --help                Show this help
`);
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    apply: false,
    machineType: 'n2-standard-8',
  };

  const readValue = (flag: string, value: string | undefined) => {
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--apply':
        options.apply = true;
        break;
      case '--project':
        options.projectId = readValue(arg, argv[++i]);
        break;
      case '--zone':
        options.zone = readValue(arg, argv[++i]);
        break;
      case '--schematic':
        options.schematicName = readValue(arg, argv[++i]);
        break;
      case '--machine-type':
        options.machineType = readValue(arg, argv[++i]);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function isMainModule() {
  const currentFile = fileURLToPath(import.meta.url);
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return currentFile === entry;
}

function runCommand(
  pm: ProcessManager,
  command: ResolvedCommand,
  args: string[],
) {
  if (command.viaCmd) {
    return pm.runSync('cmd.exe', ['/c', command.bin, ...args], { quiet: true });
  }
  return pm.runSync(command.bin, args, { quiet: true });
}

function resolveBinary(
  pm: ProcessManager,
  candidates: string[],
): ResolvedCommand | undefined {
  if (process.platform === 'win32') {
    for (const candidate of candidates) {
      const whereRes = pm.runSync('where.exe', [candidate], { quiet: true });
      if (whereRes.status !== 0) {
        continue;
      }
      const firstMatch = whereRes.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (!firstMatch) {
        continue;
      }
      return {
        bin: firstMatch,
        viaCmd: /\.cmd$/i.test(firstMatch) || /\.bat$/i.test(firstMatch),
      };
    }
    return undefined;
  }

  for (const candidate of candidates) {
    const result = runCommand(pm, { bin: candidate, viaCmd: false }, [
      '--version',
    ]);
    if (result.status === 0) {
      return { bin: candidate, viaCmd: false };
    }
  }
  return undefined;
}

function runGcloud(
  pm: ProcessManager,
  gcloudCommand: ResolvedCommand,
  args: string[],
) {
  return runCommand(pm, gcloudCommand, args);
}

function getTrimmedStdout(stdout: string): string {
  return stdout.trim().replace(/^"(.*)"$/, '$1');
}

function addResult(
  results: CheckResult[],
  name: string,
  status: Status,
  detail: string,
) {
  results.push({ name, status, detail });
}

function loadEnabledServices(raw: string): Set<string> {
  return new Set(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

function loadJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function findDirectOsLoginRoles(
  policy: { bindings?: Array<{ role?: string; members?: string[] }> },
  account: string,
) {
  const userMember = `user:${account}`;
  const bindings = policy.bindings || [];
  return bindings
    .filter((binding) => binding.members?.includes(userMember))
    .map((binding) => binding.role)
    .filter(
      (role): role is string =>
        !!role &&
        (role === 'roles/compute.osLogin' ||
          role === 'roles/compute.osAdminLogin'),
    );
}

function localKeyPaths() {
  const sshDir = path.join(os.homedir(), '.ssh');
  return {
    sshDir,
    privateKey: path.join(sshDir, 'google_compute_engine'),
    publicKey: path.join(sshDir, 'google_compute_engine.pub'),
  };
}

function loadProfileKeys(profile: {
  posixAccounts?: Array<{
    accountId?: string;
    primary?: boolean;
    username?: string;
  }>;
  sshPublicKeys?: Record<string, { key?: string }>;
  loginProfile?: {
    posixAccounts?: Array<{
      accountId?: string;
      primary?: boolean;
      username?: string;
    }>;
    sshPublicKeys?: Record<string, { key?: string }>;
  };
}) {
  const rootKeys = Object.values(profile.sshPublicKeys || {});
  const nestedKeys = Object.values(profile.loginProfile?.sshPublicKeys || {});
  return [...rootKeys, ...nestedKeys]
    .map((entry) => entry?.key?.trim())
    .filter((entry): entry is string => !!entry);
}

function getOsLoginUsername(
  profile: {
    posixAccounts?: Array<{
      accountId?: string;
      primary?: boolean;
      username?: string;
    }>;
    loginProfile?: {
      posixAccounts?: Array<{
        accountId?: string;
        primary?: boolean;
        username?: string;
      }>;
    };
  },
  projectId: string,
): string | undefined {
  const accounts = [
    ...(profile.posixAccounts || []),
    ...(profile.loginProfile?.posixAccounts || []),
  ];
  const preferred =
    accounts.find(
      (entry) =>
        entry.primary && entry.accountId === projectId && entry.username,
    ) ||
    accounts.find((entry) => entry.accountId === projectId && entry.username) ||
    accounts.find((entry) => entry.primary && entry.username) ||
    accounts.find((entry) => entry.username);

  return preferred?.username;
}

async function detectPublicIp(): Promise<string | undefined> {
  const override = process.env.GCLI_ORBIT_PUBLIC_IP?.trim();
  if (override) {
    return override.replace(/\/32$/, '');
  }

  return new Promise((resolve) => {
    const request = https.get(
      'https://api.ipify.org?format=json',
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { ip?: string };
            resolve(parsed.ip?.trim());
          } catch {
            resolve(undefined);
          }
        });
      },
    );

    request.on('error', () => resolve(undefined));
    request.setTimeout(5000, () => {
      request.destroy();
      resolve(undefined);
    });
  });
}

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9\-_]/g, '-').toLowerCase();
}

function getSchematicsDir() {
  return path.join(os.homedir(), '.gemini', 'orbit', 'schematics');
}

function saveRecommendedSchematic(options: {
  schematicName: string;
  projectId: string;
  zone: string;
  machineType: string;
  sshSourceRanges: string[];
  sshUser?: string;
}) {
  const schematicsDir = getSchematicsDir();
  fs.mkdirSync(schematicsDir, { recursive: true });
  const filePath = path.join(
    schematicsDir,
    `${sanitizeName(options.schematicName)}.json`,
  );
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        projectId: options.projectId,
        zone: options.zone,
        networkAccessType: 'external',
        useDefaultNetwork: true,
        manageFirewallRules: true,
        machineType: options.machineType,
        sshSourceRanges: options.sshSourceRanges,
        ...(options.sshUser ? { sshUser: options.sshUser } : {}),
      },
      null,
      2,
    ),
  );
  return filePath;
}

function printSummary(results: CheckResult[]) {
  console.log('\nSummary');
  for (const result of results) {
    console.log(`${result.status.padEnd(4)} ${result.name}: ${result.detail}`);
  }
}

export async function runPersonalGcpPrepare(
  argv: string[] = process.argv.slice(2),
) {
  const options = parseArgs(argv);
  const results: CheckResult[] = [];
  const pm = new ProcessManager();

  const gcloudBin = resolveBinary(
    pm,
    process.platform === 'win32' ? ['gcloud.cmd', 'gcloud'] : ['gcloud'],
  );
  if (!gcloudBin) {
    addResult(
      results,
      'gcloud',
      'FAIL',
      'gcloud is not installed or not on PATH.',
    );
    printSummary(results);
    return 1;
  }
  addResult(results, 'gcloud', 'PASS', `Using ${gcloudBin.bin}.`);

  const accountRes = runGcloud(pm, gcloudBin, [
    'config',
    'get-value',
    'account',
    '--quiet',
  ]);
  const account = getTrimmedStdout(accountRes.stdout);
  if (accountRes.status !== 0 || !account || account === '(unset)') {
    addResult(
      results,
      'gcloud auth',
      'FAIL',
      'No active gcloud account. Run: gcloud auth login',
    );
    printSummary(results);
    return 1;
  }
  addResult(results, 'gcloud auth', 'PASS', `Active account: ${account}`);

  const activeProjectRes = runGcloud(pm, gcloudBin, [
    'config',
    'get-value',
    'project',
    '--quiet',
  ]);
  const activeProject = getTrimmedStdout(activeProjectRes.stdout);
  const projectId =
    options.projectId ||
    (activeProject && activeProject !== '(unset)' ? activeProject : undefined);
  if (!projectId) {
    addResult(
      results,
      'project',
      'FAIL',
      'No project selected. Pass --project or run: gcloud config set project <id>',
    );
    printSummary(results);
    return 1;
  }
  addResult(results, 'project', 'PASS', `Using project ${projectId}`);

  const zone = options.zone || 'us-central1-a';
  addResult(results, 'zone', 'PASS', `Using zone ${zone}`);

  const detectedPublicIp = await detectPublicIp();
  const recommendedSshRanges = detectedPublicIp
    ? [`${detectedPublicIp}/32`]
    : ['0.0.0.0/0'];
  addResult(
    results,
    'ssh ingress',
    detectedPublicIp ? 'PASS' : 'WARN',
    detectedPublicIp
      ? `Detected public IP ${detectedPublicIp}; will scope SSH ingress to ${recommendedSshRanges[0]}.`
      : 'Could not detect current public IP; fallback for generated schematic is 0.0.0.0/0.',
  );

  const adcRes = runGcloud(pm, gcloudBin, [
    'auth',
    'application-default',
    'print-access-token',
  ]);
  if (adcRes.status === 0 && getTrimmedStdout(adcRes.stdout)) {
    addResult(
      results,
      'ADC',
      'PASS',
      'Application Default Credentials are ready.',
    );
  } else {
    addResult(
      results,
      'ADC',
      'FAIL',
      'ADC missing. Run: gcloud auth application-default login',
    );
  }

  const billingRes = runGcloud(pm, gcloudBin, [
    'billing',
    'projects',
    'describe',
    projectId,
    '--format=json',
  ]);
  if (billingRes.status === 0) {
    const billing = loadJson<{ billingEnabled?: boolean }>(
      billingRes.stdout,
      {},
    );
    if (billing.billingEnabled === false) {
      addResult(
        results,
        'billing',
        'FAIL',
        `Billing is disabled for ${projectId}.`,
      );
    } else if (billing.billingEnabled === true) {
      addResult(results, 'billing', 'PASS', 'Billing is enabled.');
    } else {
      addResult(
        results,
        'billing',
        'WARN',
        'Billing status was not explicit in gcloud output.',
      );
    }
  } else {
    addResult(
      results,
      'billing',
      'WARN',
      'Could not verify billing status with gcloud.',
    );
  }

  const servicesRes = runGcloud(pm, gcloudBin, [
    'services',
    'list',
    '--enabled',
    '--project',
    projectId,
    '--format=value(config.name)',
  ]);
  const enabledServices =
    servicesRes.status === 0
      ? loadEnabledServices(servicesRes.stdout)
      : new Set<string>();
  const missingServices = REQUIRED_SERVICES.filter(
    (service) => !enabledServices.has(service),
  );

  if (servicesRes.status !== 0) {
    addResult(
      results,
      'apis',
      'FAIL',
      'Could not list enabled GCP services for the target project.',
    );
  } else if (missingServices.length === 0) {
    addResult(results, 'apis', 'PASS', 'Required GCP APIs are enabled.');
  } else if (options.apply) {
    const enableRes = runGcloud(pm, gcloudBin, [
      'services',
      'enable',
      ...missingServices,
      '--project',
      projectId,
    ]);
    if (enableRes.status === 0) {
      addResult(
        results,
        'apis',
        'PASS',
        `Enabled: ${missingServices.join(', ')}`,
      );
    } else {
      addResult(
        results,
        'apis',
        'FAIL',
        `Failed to enable: ${missingServices.join(', ')}`,
      );
    }
  } else {
    addResult(
      results,
      'apis',
      'FAIL',
      `Missing: ${missingServices.join(', ')}. Re-run with --apply to enable them.`,
    );
  }

  const policyRes = runGcloud(pm, gcloudBin, [
    'projects',
    'get-iam-policy',
    projectId,
    '--format=json',
  ]);
  if (policyRes.status === 0) {
    const policy = loadJson<{
      bindings?: Array<{ role?: string; members?: string[] }>;
    }>(policyRes.stdout, {});
    const roles = findDirectOsLoginRoles(policy, account);
    if (roles.length > 0) {
      addResult(
        results,
        'os-login iam',
        'PASS',
        `Direct role(s): ${roles.join(', ')}`,
      );
    } else {
      addResult(
        results,
        'os-login iam',
        'WARN',
        'No direct OS Login role found for the active user. Group/inherited access may still work.',
      );
    }
  } else {
    addResult(
      results,
      'os-login iam',
      'WARN',
      'Could not inspect project IAM bindings.',
    );
  }

  const { sshDir, privateKey, publicKey } = localKeyPaths();
  const privateExists = fs.existsSync(privateKey);
  const publicExists = fs.existsSync(publicKey);
  let osLoginUser: string | undefined;

  if (privateExists && publicExists) {
    addResult(results, 'ssh key', 'PASS', `Found ${privateKey}`);
  } else if (privateExists !== publicExists) {
    addResult(
      results,
      'ssh key',
      'FAIL',
      'google_compute_engine keypair is incomplete. Repair or remove it before continuing.',
    );
  } else if (options.apply) {
    const sshKeygenBin = resolveBinary(
      pm,
      process.platform === 'win32'
        ? ['ssh-keygen', 'ssh-keygen.exe']
        : ['ssh-keygen'],
    );
    if (!sshKeygenBin) {
      addResult(
        results,
        'ssh key',
        'FAIL',
        'ssh-keygen is not installed or not on PATH.',
      );
    } else {
      fs.mkdirSync(sshDir, { recursive: true });
      ensureParentDir(privateKey);
      const keygenRes = runCommand(pm, sshKeygenBin, [
        '-t',
        'rsa',
        '-b',
        '3072',
        '-N',
        '',
        '-C',
        account,
        '-f',
        privateKey,
      ]);
      if (
        keygenRes.status === 0 &&
        fs.existsSync(privateKey) &&
        fs.existsSync(publicKey)
      ) {
        addResult(results, 'ssh key', 'PASS', `Generated ${privateKey}`);
      } else {
        addResult(
          results,
          'ssh key',
          'FAIL',
          'Failed to generate ~/.ssh/google_compute_engine',
        );
      }
    }
  } else {
    addResult(
      results,
      'ssh key',
      'FAIL',
      'Missing ~/.ssh/google_compute_engine. Re-run with --apply to generate it.',
    );
  }

  if (fs.existsSync(publicKey)) {
    const localPubKey = fs.readFileSync(publicKey, 'utf8').trim();
    const profileRes = runGcloud(pm, gcloudBin, [
      'compute',
      'os-login',
      'describe-profile',
      '--project',
      projectId,
      '--format=json',
    ]);
    const profileData =
      profileRes.status === 0 ? loadJson(profileRes.stdout, {}) : {};
    const profileKeys =
      profileRes.status === 0 ? loadProfileKeys(profileData) : [];
    osLoginUser =
      profileRes.status === 0
        ? getOsLoginUsername(profileData, projectId)
        : undefined;
    const registered = profileKeys.includes(localPubKey);

    if (osLoginUser) {
      addResult(
        results,
        'ssh user',
        'PASS',
        `OS Login username: ${osLoginUser}`,
      );
    } else {
      addResult(
        results,
        'ssh user',
        'WARN',
        'Could not determine an OS Login POSIX username for this project.',
      );
    }

    if (registered) {
      addResult(
        results,
        'os-login key',
        'PASS',
        'Local google_compute_engine public key is registered with OS Login.',
      );
    } else if (options.apply) {
      const addKeyRes = runGcloud(pm, gcloudBin, [
        'compute',
        'os-login',
        'ssh-keys',
        'add',
        '--project',
        projectId,
        '--key-file',
        publicKey,
      ]);
      if (addKeyRes.status === 0) {
        addResult(
          results,
          'os-login key',
          'PASS',
          'Registered local public key with OS Login.',
        );
      } else {
        addResult(
          results,
          'os-login key',
          'FAIL',
          'Failed to register the local public key with OS Login.',
        );
      }
    } else {
      addResult(
        results,
        'os-login key',
        'FAIL',
        'Local google_compute_engine key is not registered with OS Login. Re-run with --apply to register it.',
      );
    }
  }

  if (options.schematicName) {
    const schematicPath = path.join(
      getSchematicsDir(),
      `${sanitizeName(options.schematicName)}.json`,
    );
    if (options.apply) {
      saveRecommendedSchematic({
        schematicName: options.schematicName,
        projectId,
        zone,
        machineType: options.machineType,
        sshSourceRanges: recommendedSshRanges,
        sshUser: osLoginUser,
      });
      addResult(
        results,
        'schematic',
        'PASS',
        `Saved recommended schematic to ${schematicPath} with SSH ingress ${recommendedSshRanges.join(', ')}`,
      );
    } else {
      addResult(
        results,
        'schematic',
        'WARN',
        `Dry run only. Re-run with --apply to save ${schematicPath} with SSH ingress ${recommendedSshRanges.join(', ')}`,
      );
    }
  }

  printSummary(results);

  const hasFailures = results.some((result) => result.status === 'FAIL');
  if (!hasFailures) {
    console.log('\nNext');
    if (options.schematicName) {
      console.log(
        `node bundle/orbit-cli.js infra liftoff <station-name> --schematic ${options.schematicName}`,
      );
    } else {
      console.log(
        'node bundle/orbit-cli.js infra liftoff <station-name> --schematic <schematic-name>',
      );
    }
    console.log(
      'node bundle/orbit-cli.js mission start <mission-id> chat --for-station <station-name>',
    );
  }

  return hasFailures ? 1 : 0;
}

if (isMainModule()) {
  runPersonalGcpPrepare().then((code) => {
    process.exit(code);
  });
}

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

import {
  runGcpPrepare,
  type PrepareOptions,
  type CheckResult,
} from '../src/utils/GcpPrepare.js';

type Status = 'PASS' | 'WARN' | 'FAIL';

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

function parseArgs(argv: string[]): PrepareOptions {
  const options: PrepareOptions = {
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
  const results = await runGcpPrepare(options);

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

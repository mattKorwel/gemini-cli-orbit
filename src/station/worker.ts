/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Universal Orbit Station (Remote)
 *
 * Multi-command orchestrator for remote development.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { StationSupervisor } from './StationSupervisor.js';
import { StatusAggregator } from './StatusAggregator.js';
import { getManifestFromEnv } from '../utils/MissionUtils.js';

const getDirname = () => {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return __dirname;
  }
};

const _dirname = getDirname();

/**
 * Main entry point for the worker.
 */
export async function main(argv: string[]) {
  const station = new StationSupervisor(_dirname);
  const aggregator = new StatusAggregator();

  const isProcessArgv = argv === process.argv;
  const rawArgs = isProcessArgv ? hideBin(argv) : argv;

  await yargs(rawArgs)
    .scriptName('orbit-worker')
    .usage('$0 <command> [args]')
    .command(
      'status',
      'Aggregate mission state manifests',
      () => {},
      async () => {
        const result = await aggregator.getStatus();
        console.log(JSON.stringify(result, null, 2));
      },
    )
    .command(
      'start',
      'Unified mission start (init + hooks + run)',
      () => {},
      async () => {
        const manifest = getManifestFromEnv();
        const exitCode = await station.start(manifest);
        process.exit(exitCode);
      },
    )
    .command(
      'setup-hooks',
      'Configure mission-control hooks (standalone)',
      () => {},
      async () => {
        const manifest = getManifestFromEnv();
        await station.setupHooks(manifest);
      },
    )
    .command(
      'init',
      'Initialize Git workspace (standalone)',
      () => {},
      async () => {
        const manifest = getManifestFromEnv();
        await station.initGit(manifest);
      },
    )
    .command(
      'run',
      'Spawns a mission session (standalone)',
      () => {},
      async () => {
        const manifest = getManifestFromEnv();
        await station.runMission(manifest);
      },
    )
    .command(
      'run-internal',
      'Executes a mission playbook (internal)',
      () => {},
      async () => {
        const manifest = getManifestFromEnv();
        await station.runPlaybook(manifest);
      },
    )
    .demandCommand(1, 'Please specify a command')
    .help()
    .parseAsync();

  return 0;
}

if (
  process.argv[1] &&
  (import.meta.url === pathToFileURL(process.argv[1]).href ||
    import.meta.url === `file://${process.argv[1]}`)
) {
  main(process.argv)
    .then(() => {})
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

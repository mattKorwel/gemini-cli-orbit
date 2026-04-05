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
      'setup-hooks [targetDir]',
      'Configure mission-control hooks',
      (y) => {
        y.positional('targetDir', { type: 'string', default: process.cwd() });
      },
      async (argv) => {
        await station.setupHooks(argv.targetDir as string);
      },
    )
    .command(
      'init <targetDir> <id> <branch> <url> [mirror]',
      'Initialize Git workspace',
      (y) => {
        y.positional('targetDir', { type: 'string' });
        y.positional('id', { type: 'string' });
        y.positional('branch', { type: 'string' });
        y.positional('url', { type: 'string' });
        y.positional('mirror', { type: 'string' });
      },
      async (argv) => {
        await station.initGit(
          argv.targetDir as string,
          argv.url as string,
          argv.branch as string,
          argv.mirror as string,
        );
      },
    )
    .command(
      'run <id> <branch> <action> <workDir> <policy> [sessionName]',
      'Spawns a mission in a persistent session',
      (y) => {
        y.positional('id', { type: 'string' });
        y.positional('branch', { type: 'string' });
        y.positional('action', { type: 'string' });
        y.positional('workDir', { type: 'string' });
        y.positional('policy', { type: 'string' });
        y.positional('sessionName', { type: 'string' });
      },
      async (argv) => {
        await station.runMission(
          argv.id as string,
          argv.branch as string,
          argv.action as string,
          argv.workDir as string,
          argv.policy as string,
          argv.sessionName as string,
        );
      },
    )
    .command(
      'run-internal <id> <branch> <action> <workDir> <policy> [sessionName]',
      'Executes a mission playbook (internal)',
      (y) => {
        y.positional('id', { type: 'string' });
        y.positional('branch', { type: 'string' });
        y.positional('action', { type: 'string' });
        y.positional('workDir', { type: 'string' });
        y.positional('policy', { type: 'string' });
        y.positional('sessionName', { type: 'string' });
      },
      async (argv) => {
        await station.runPlaybook(
          argv.id as string,
          argv.branch as string,
          argv.action as string,
          argv.workDir as string,
          argv.policy as string,
          argv.sessionName as string,
        );
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

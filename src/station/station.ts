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

import { hideBin } from 'yargs/helpers';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

import { StationSupervisor } from './StationSupervisor.js';
import { StatusAggregator } from './StatusAggregator.js';
import { logger } from '../core/Logger.js';
import { getManifestFromEnv } from '../utils/MissionUtils.js';
import { type IProcessManager } from '../core/interfaces.js';
import { ProcessManager } from '../core/ProcessManager.js';

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
export async function main(
  argv: string[],
  pm: IProcessManager = new ProcessManager(),
) {
  try {
    const station = new StationSupervisor(_dirname, pm);

    const action = argv[0] || 'start';

    // Special Case: status aggregation can run without a manifest
    if (action === 'status') {
      const root = argv[1];
      const aggregator = new StatusAggregator(root);
      const result = await aggregator.getStatus(root);
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    // ADR 0018: Manifest-First execution
    // If we have a manifest in the environment, we use it to determine the action.
    // This allows the SDK to trigger complex flows with a single RPC call.
    const manifest = getManifestFromEnv();
    logger.setVerbose(manifest.verbose === true);

    // If the manifest exists, we follow its 'action'
    // but we still allow positional overrides for standalone worker testing
    const currentAction = argv[0] || manifest.action || 'start';

    switch (currentAction) {
      case 'start': {
        return await station.start(manifest);
      }
      case 'setup-hooks': {
        await station.setupHooks(manifest);
        return 0;
      }
      case 'init': {
        await station.initGit(manifest);
        return 0;
      }
      case 'run': {
        return await station.runMission(manifest);
      }
      case 'help':
      case '--help': {
        printHelp();
        return 0;
      }
      default: {
        console.error(`❌ Unknown worker action: ${currentAction}`);
        return 1;
      }
    }
  } catch (e: any) {
    console.error(`❌ Station Failure: ${e.message}`);
    if (e.stack) console.error(e.stack);
    return 1;
  }
}

function printHelp() {
  console.log(`
Orbit Station: Universal Mission Orchestrator

Usage:
  GCLI_ORBIT_MANIFEST='{...}' node station.js [action]

Actions (determined by manifest.action if omitted):
  start          Unified mission start (init + hooks + run)
  status         Aggregate mission state manifests
  setup-hooks    Configure mission-control hooks (standalone)
  init           Initialize Git workspace (standalone)
  run            Spawns a mission session (standalone)
  `);
}

if (
  process.argv[1] &&
  (import.meta.url === pathToFileURL(process.argv[1]).href ||
    import.meta.url === `file://${process.argv[1]}`)
) {
  // Hide node and script path
  const args = hideBin(process.argv);
  main(args)
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

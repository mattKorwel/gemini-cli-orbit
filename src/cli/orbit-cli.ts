/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// --- CORE IMPORTS ---
import { runOrchestrator } from '../core/orchestrator.js';
import { runFleet } from '../core/fleet.js';
import { runStatus } from '../core/status.js';
import { runJettison } from '../core/jettison.js';
import { runSetup } from '../core/setup.js';
import { runSplashdown } from '../core/splashdown.js';
import { runReap } from '../core/reap.js';
import { runCI } from '../core/ci.js';
import { runLogs } from '../core/logs.js';
import { runAttach } from '../core/attach.js';
import { runInstallShell } from '../core/install-shell.js';

/**
 * Expands a tilde (~) in a path string to the user's home directory.
 */
function expandPath(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Main CLI entry point using Yargs for declarative command routing.
 */
export async function dispatch(argv: string[]): Promise<number> {
  // Pre-process for repo:cmd shorthand
  const processedArgv = [...argv];
  if (processedArgv[0] && processedArgv[0].includes(':') && !processedArgv[0].startsWith('-')) {
    const [repo, actualCmd] = processedArgv[0].split(':');
    if (actualCmd) {
      process.env.GCLI_ORBIT_REPO_NAME = repo;
      processedArgv[0] = actualCmd;
    }
  }

  const parser = yargs(processedArgv)
    .scriptName('orbit')
    .usage('$0 <command> [args]')
    .strict()
    .help()
    .alias('h', 'help')
    // --- GLOBAL FLAGS ---
    .option('local', {
      alias: 'l',
      type: 'boolean',
      description: 'Force local worktree mode',
    })
    .option('repo', {
      alias: 'r',
      type: 'string',
      description: 'Override the detected repository name',
    })
    .option('repo-dir', {
      type: 'string',
      description: 'Set the target repository directory',
    })
    .option('for-station', {
      type: 'string',
      description: 'Target a specific station',
    })
    .option('schematic', {
      type: 'string',
      description: 'Use a specific schematic for liftoff',
    })
    .option('verbose', {
      type: 'boolean',
      description: 'Show detailed infrastructure logs',
    })
    // --- COMMANDS ---
    .command(
      'mission <identifier> [action]',
      'Launch or resume an isolated developer presence.',
      (y) => {
        return y
          .positional('identifier', { type: 'string', demandOption: true })
          .positional('action', { type: 'string', default: 'chat' });
      },
      async (args) => {
        applyGlobalFlags(args);
        args.exitCode = await runOrchestrator(args.identifier, args.action, args._.map(String).slice(1), args as any);
      },
    )
    .command(
      'schematic <action> [name]',
      'Manage infrastructure blueprints.',
      (y) => {
        return y
          .positional('action', { choices: ['list', 'create', 'edit', 'import'], demandOption: true })
          .positional('name', { type: 'string' })
          .option('projectId', { type: 'string' })
          .option('zone', { type: 'string' })
          .option('backend', { type: 'string' })
          .option('dnsSuffix', { type: 'string' })
          .option('userSuffix', { type: 'string' })
          .option('vpcName', { type: 'string' })
          .option('subnetName', { type: 'string' })
          .option('machineType', { type: 'string' })
          .option('instanceName', { type: 'string' })
          .option('image', { type: 'string' });
      },
      async (args) => {
        applyGlobalFlags(args);
        // Map yargs flags back to OrbitConfig keys where needed
        const configFlags = {
          ...args,
          backendType: args.backend,
          imageUri: args.image,
        };
        args.exitCode = await runFleet(['schematic', args.action, args.name || ''], configFlags as any);
      },
    )
    .command(
      'station <action> [name]',
      'Hardware control: <activate|list|liftoff|delete>',
      (y) => {
        return y
          .positional('action', { choices: ['list', 'activate', 'liftoff', 'delete'], demandOption: true })
          .positional('name', { type: 'string' })
          .option('setup-net', { type: 'boolean' })
          .option('with-new-station', { type: 'boolean' });
      },
      async (args) => {
        applyGlobalFlags(args);
        const fleetArgs = ['station', args.action, args.name || ''];
        if (args['setup-net']) fleetArgs.push('--setup-net');
        if (args['with-new-station']) fleetArgs.push('--with-new-station');
        args.exitCode = await runFleet(fleetArgs, args as any);
      },
    )
    .command(
      'pulse',
      'Check station health and active mission status.',
      {},
      async (args) => {
        applyGlobalFlags(args);
        args.exitCode = await runStatus();
      },
    )
    .command(
      'uplink <identifier> [action]',
      'Inspect latest local or remote mission telemetry.',
      (y) => {
        return y
          .positional('identifier', { type: 'string', demandOption: true })
          .positional('action', { type: 'string', default: 'review' });
      },
      async (args) => {
        applyGlobalFlags(args);
        args.exitCode = await runLogs(args.identifier, args.action);
      },
    )
    .command(
      'ci [branch]',
      'Monitor CI status for a branch with noise filtering.',
      (y) => {
        return y.positional('branch', { type: 'string' });
      },
      async (args) => {
        applyGlobalFlags(args);
        args.exitCode = await runCI(args.branch ? [args.branch] : []);
      },
    )
    .command(
      'jettison <identifier> [action]',
      'Decommission a specific mission and its worktree.',
      (y) => {
        return y
          .positional('identifier', { type: 'string', demandOption: true })
          .positional('action', { type: 'string', default: 'chat' })
          .option('yes', { alias: 'y', type: 'boolean', description: 'Bypass confirmation' });
      },
      async (args) => {
        applyGlobalFlags(args);
        args.exitCode = await runJettison(args.identifier, args.action, args.yes ? ['--yes'] : []);
      },
    )
    .command(
      'reap',
      'Cleanup idle mission capsules based on inactivity.',
      (y) => {
        return y
          .option('threshold', { type: 'number', description: 'Idle threshold in hours' })
          .option('force', { type: 'boolean', description: 'Force cleanup' });
      },
      async (args) => {
        applyGlobalFlags(args);
        args.exitCode = await runReap({
          ...(args.threshold !== undefined ? { threshold: args.threshold } : {}),
          ...(args.force !== undefined ? { force: args.force } : {}),
        });
      },
    )
    .command(
      'splashdown',
      'Emergency shutdown of all active remote capsules.',
      (y) => {
        return y.option('all', { type: 'boolean', description: 'Stop the station VM as well' });
      },
      async (args) => {
        applyGlobalFlags(args);
        args.exitCode = await runSplashdown(args.all ? ['--all'] : []);
      },
    )
    .command(
      'attach <identifier> [action]',
      'Attach to an active mission session.',
      (y) => {
        return y
          .positional('identifier', { type: 'string', demandOption: true })
          .positional('action', { type: 'string', default: 'chat' });
      },
      async (args) => {
        applyGlobalFlags(args);
        args.exitCode = await runAttach(args.identifier, args.action);
      },
    )
    .command(
      'install-shell',
      'Install Orbit shell aliases and tab-completion.',
      {},
      async (args) => {
        args.exitCode = await runInstallShell();
      },
    )
    .command(
      'liftoff [schematic]',
      'Build or wake Orbital Station infrastructure.',
      (y) => {
        return y
          .positional('schematic', { type: 'string' })
          .option('setup-net', { type: 'boolean' })
          .option('with-new-station', { type: 'boolean' })
          .option('destroy', { type: 'boolean', description: 'Decommission infrastructure' });
      },
      async (args) => {
        applyGlobalFlags(args);
        const setupArgs = args.schematic ? [args.schematic] : [];
        if (args['setup-net']) setupArgs.push('--setup-net');
        if (args['with-new-station']) setupArgs.push('--with-new-station');
        if (args.destroy) setupArgs.push('--destroy');
        args.exitCode = await runSetup(setupArgs, args as any);
      },
    );

  // Global flag processing helper
  function applyGlobalFlags(args: any) {
    if (args.local) {
      process.env.GCLI_ORBIT_PROVIDER = 'local-worktree';
      process.env.GCLI_MCP = '0';
    }
    if (args.repo) {
      process.env.GCLI_ORBIT_REPO_NAME = args.repo;
    }
    if (args['repo-dir']) {
      const val = expandPath(args['repo-dir']);
      if (!fs.existsSync(val)) {
        throw new Error(`❌ Repository directory not found: ${val}`);
      }
      process.chdir(val);
    }
    if (args['for-station']) {
      process.env.GCLI_ORBIT_INSTANCE_NAME = args['for-station'];
    }
    if (args.schematic) {
      process.env.GCLI_ORBIT_SCHEMATIC = args.schematic;
    }
    if (args.verbose) {
      process.env.GCLI_ORBIT_VERBOSE = '1';
    }
    // Ensure CLI knows it is a command to bypass interactive UI
    process.env.GCLI_ORBIT_SHIM = '1';
  }

  try {
    const result = await parser.parse();
    return (result as any).exitCode ?? 0;
  } catch (err: any) {
    console.error(`\n❌ Error: ${err.message}`);
    return 1;
  }
}

async function main() {
  const code = await dispatch(process.argv.slice(2));
  process.exit(code);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}

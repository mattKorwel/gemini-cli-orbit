/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import yargs, { type Argv } from 'yargs';
import { OrbitSDK, type IOrbitSDK } from '../sdk/OrbitSDK.js';
import { getRepoConfig, detectRepoName } from '../core/ConfigManager.js';
import { ConsoleObserver } from '../core/Logger.js';

function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export async function dispatch(argv: string[]): Promise<number> {
  const processedArgv = [...argv];

  // Shorthand for repo:cmd
  if (
    processedArgv[0] &&
    processedArgv[0].includes(':') &&
    !processedArgv[0].startsWith('-')
  ) {
    const [repo, actualCmd] = processedArgv[0].split(':');
    process.env.GCLI_ORBIT_REPO_NAME = repo;
    processedArgv[0] = actualCmd;
  }

  // Top-level Aliases (Plurals & High-velocity)
  const topAliases: Record<string, string> = {
    stations: 'station',
    missions: 'mission',
    schematics: 'infra',
    pulses: 'station',
    provision: 'infra',
  };
  if (processedArgv[0] && topAliases[processedArgv[0]]) {
    processedArgv[0] = topAliases[processedArgv[0]];
  }

  const parser = yargs(processedArgv)
    .scriptName('orbit')
    .usage('$0 <command> [args]')
    .demandCommand(1, 'Please specify a command.')
    .showHelpOnFail(true)
    .exitProcess(false)
    .wrap(null)
    .help()
    .alias('h', 'help')

    // --- GLOBAL FLAGS ---
    .group(['local', 'repo', 'repo-dir'], 'Source Context:')
    .option('local', {
      alias: 'l',
      type: 'boolean',
      description: 'Force local workspace mode',
    })
    .option('repo', {
      alias: 'r',
      type: 'string',
      description: 'Override detected repository name',
    })
    .option('repo-dir', {
      type: 'string',
      description: 'Set target repository directory',
    })

    .group(['for-station', 'schematic'], 'Hardware Targets:')
    .option('for-station', {
      type: 'string',
      description: 'Target a specific station instance',
    })
    .option('schematic', {
      type: 'string',
      description: 'The blueprint to use for liftoff',
    })

    .group(['verbose'], 'Output Options:')
    .option('verbose', {
      type: 'boolean',
      description: 'Show detailed infrastructure logs',
    })

    // --- COMMANDS ---

    // 1. MISSION
    .command(
      'mission [identifier] [action] [extra..]',
      'The Workflow: Start, uplink, attach, ci, or jettison.',
      (y: Argv) => {
        return y
          .positional('identifier', {
            type: 'string',
            description: 'PR or Issue ID (Optional inside capsule)',
          })
          .positional('action', {
            type: 'string',
            default: 'chat',
            description:
              'Verb: chat, uplink, attach, ci, jettison, fix, review, implement',
          });
      },
      async (args: any) => {
        const sdk = createSDK(args);
        const mId =
          (args.identifier as string) || process.env.GCLI_ORBIT_MISSION_ID;
        const { action, extra = [] } = args;

        if (!mId) {
          console.error('\n❌ Error: Mission identifier is required.');
          console.log(
            '💡 Tip: If you are not inside a capsule, you must provide the PR/Issue ID.',
          );
          args.exitCode = 1;
          return;
        }

        if (action === 'uplink') {
          args.exitCode = await sdk.getLogs({
            identifier: mId,
            action: extra[0] || 'chat',
          });
          return;
        }
        if (action === 'attach') {
          args.exitCode = await sdk.attach({
            identifier: mId,
            action: extra[0] || 'chat',
          });
          return;
        }
        if (action === 'ci') {
          const status = await sdk.monitorCI({ branch: mId });
          console.log(
            `CI Status: ${status.status} (${status.runs.join(', ')})`,
          );
          args.exitCode = status.status === 'FAILED' ? 1 : 0;
          return;
        }
        if (action === 'jettison') {
          const res = await sdk.jettisonMission({
            identifier: mId,
            action: extra[0] || 'chat',
          });
          args.exitCode = res.exitCode;
          return;
        }

        const result = await sdk.startMission({
          identifier: mId,
          action,
          args: extra,
        });
        args.exitCode = result.exitCode;
      },
    )

    // 2. STATION
    .command(
      'station <action> [name]',
      'The Hardware: List, activate, hibernate, pulse, or reap.',
      (y: Argv) => {
        return y
          .positional('action', {
            choices: [
              'list',
              'ls',
              'activate',
              'use',
              'hibernate',
              'stop',
              'delete',
              'rm',
              'pulse',
              'reap',
            ],
            demandOption: true,
          })
          .positional('name', { type: 'string', description: 'Instance name' })
          .option('sync', {
            alias: 's',
            type: 'boolean',
            description: 'Sync with reality',
          });
      },
      async (args: any) => {
        const sdk = createSDK(args);
        const { action, name, sync } = args;

        if ((action === 'activate' || action === 'use') && name) {
          await sdk.activateStation(name);
          return;
        }
        if ((action === 'hibernate' || action === 'stop') && name) {
          await sdk.hibernate({ name });
          return;
        }
        if (action === 'list' || action === 'ls') {
          const stations = await sdk.listStations({ syncWithReality: sync });
          sdk.observer.onDivider?.('ORBIT CONSTELLATION');
          if (stations.length === 0) {
            console.log('✅ No provisioned stations found.');
            return;
          }
          stations.forEach((s) => {
            const typeIcon = s.type === 'gce' ? '☁️ ' : '🏠';
            console.log(
              `${s.isActive ? '➡️ ' : '  '} ${typeIcon} ${s.name.padEnd(30)} [${s.status || 'READY'}] [${s.repo}]`,
            );
          });
          return;
        }
        if (action === 'pulse') {
          const pulse = await sdk.getPulse();
          console.log(
            `\n🛰️  ORBIT PULSE: ${pulse.stationName} (${pulse.repoName})`,
          );
          console.log('-'.repeat(80));
          console.log(`   - Station State:  ${pulse.status}`);
          if (pulse.internalIp)
            console.log(`   - Internal IP:    ${pulse.internalIp}`);
          if (pulse.externalIp)
            console.log(`   - External IP:    ${pulse.externalIp}`);

          console.log('\n📦 ACTIVE MISSION CAPSULES:');
          if (pulse.capsules.length === 0) {
            console.log('     - No mission capsules found');
          } else {
            pulse.capsules.forEach((c) => {
              const stateIcon =
                c.state === 'WAITING'
                  ? '⏳'
                  : c.state === 'THINKING'
                    ? '🧠'
                    : '💤';
              console.log(
                `     ${stateIcon} ${c.name.padEnd(30)} [${c.state}] CPU: ${c.stats?.cpu || '0%'} MEM: ${c.stats?.memory || '0MB'}`,
              );
            });
          }
          console.log('-'.repeat(80));
          args.exitCode = 0;
          return;
        }
        if (action === 'reap') {
          await sdk.reapMissions({
            threshold: args.threshold,
            force: args.force,
          });
          return;
        }
        if ((action === 'delete' || action === 'rm') && name) {
          await sdk.deleteStation({ name });
          return;
        }
      },
    )

    // 3. INFRA
    .command(
      'infra <action> [name]',
      'The Foundation: Liftoff, splashdown, or schematic.',
      (y: Argv) => {
        return y
          .positional('action', {
            choices: ['liftoff', 'splashdown', 'schematic'],
            demandOption: true,
          })
          .positional('name', { type: 'string' })
          .option('schematic', {
            alias: 's',
            type: 'string',
            description: 'Blueprint to use',
          })
          .option('destroy', {
            type: 'boolean',
            description: 'Decommission infrastructure',
          })
          .option('import', {
            type: 'string',
            description: 'Import schematic from file or URL',
          })
          .option('show', {
            type: 'boolean',
            description: 'Show schematic details',
          });
      },
      async (args: any) => {
        const { action, name, schematic, destroy } = args;
        if (action === 'liftoff') {
          process.env.GCLI_ORBIT_INSTANCE_NAME = name;
          const sdk = createSDK(args);
          args.exitCode = await sdk.provisionStation({
            schematicName: schematic,
            destroy,
          });
        } else if (action === 'splashdown') {
          const sdk = createSDK(args);
          args.exitCode = await sdk.splashdown({ name, all: args.all });
        } else if (action === 'schematic') {
          const sdk = createSDK(args);
          if (args.import) {
            const imported = await sdk.importSchematic(args.import);
            console.log(`✅ Schematic "${imported}" imported.`);
            return;
          }
          if (name) {
            if (args.show) {
              const config = sdk.getSchematic(name);
              if (!config) {
                console.error(`❌ Schematic "${name}" not found.`);
                args.exitCode = 1;
                return;
              }
              console.log(`\n📐 ORBIT SCHEMATIC: ${name}`);
              console.log('-'.repeat(80));
              console.log(JSON.stringify(config, null, 2));
              console.log('-'.repeat(80));
              return;
            }
            await sdk.runSchematicWizard(name, args);
            return;
          }
          const schematics = sdk.listSchematics();
          console.log('\n📐 ORBIT SCHEMATICS');
          schematics.forEach((s) => console.log(`   ${s}`));
        }
      },
    )

    // 4. CONFIG
    .command(
      'config <action>',
      'The Local: Setup environment and integrations.',
      (y: Argv) => {
        return y.positional('action', {
          choices: ['install', 'show'],
          demandOption: true,
        });
      },
      async (args: any) => {
        const sdk = createSDK(args);
        if (args.action === 'install') {
          await sdk.installShell();
        } else if (args.action === 'show') {
          const config = getRepoConfig();
          console.log('\n🛠️  ORBIT RESOLVED CONFIG');
          console.log('-'.repeat(80));
          console.log(JSON.stringify(config, null, 2));
          console.log('-'.repeat(80));
        }
      },
    )

    // --- HIDDEN VELOCITY ALIASES ---
    .command('uplink <identifier> [action]', false, {}, async (args: any) => {
      const sdk = createSDK(args);
      args.exitCode = await sdk.getLogs({
        identifier: args.identifier,
        action: args.action,
      });
    })
    .command('attach <identifier>', false, {}, async (args: any) => {
      const sdk = createSDK(args);
      args.exitCode = await sdk.attach({ identifier: args.identifier });
    })
    .command('ci [branch]', false, {}, async (args: any) => {
      const sdk = createSDK(args);
      const s = await sdk.monitorCI({ branch: args.branch });
      args.exitCode = s.status === 'FAILED' ? 1 : 0;
    })
    .command('jettison <identifier>', false, {}, async (args: any) => {
      const sdk = createSDK(args);
      const res = await sdk.jettisonMission({ identifier: args.identifier });
      args.exitCode = res.exitCode;
    })
    .command(
      'liftoff <name>',
      false,
      (y: Argv) => y.option('schematic', { alias: 's' }),
      async (args: any) => {
        process.env.GCLI_ORBIT_INSTANCE_NAME = args.name;
        const sdk = createSDK(args);
        args.exitCode = await sdk.provisionStation({
          schematicName: args.schematic,
        });
      },
    )
    .command('pulse', false, {}, async (args: any) => {
      const sdk = createSDK(args);
      const p = await sdk.getPulse();
      console.log(`🛰️  PULSE: ${p.status}`);
    })
    .command('install-shell', false, {}, async (args: any) => {
      const sdk = createSDK(args);
      await sdk.installShell();
    });

  function applyGlobalFlags(args: any): string {
    if (args.local) {
      process.env.GCLI_ORBIT_PROVIDER = 'local-workspace';
      process.env.GCLI_MCP = '0';
    }
    if (args.repo) process.env.GCLI_ORBIT_REPO_NAME = args.repo;
    let repoRoot = process.cwd();
    if (args['repo-dir']) {
      const val = expandPath(args['repo-dir']);
      if (!fs.existsSync(val))
        throw new Error(`❌ Directory not found: ${val}`);
      repoRoot = path.resolve(val);
      process.chdir(repoRoot);
    }
    if (args['for-station'])
      process.env.GCLI_ORBIT_INSTANCE_NAME = args['for-station'];
    if (args.schematic) process.env.GCLI_ORBIT_SCHEMATIC = args.schematic;
    if (args.verbose) process.env.GCLI_ORBIT_VERBOSE = '1';
    process.env.GCLI_ORBIT_SHIM = '1';
    return repoRoot;
  }

  function createSDK(args: any): IOrbitSDK {
    const root = applyGlobalFlags(args);
    const name = args.repo || detectRepoName(root);
    const config = getRepoConfig(name, args, root);
    return new OrbitSDK(config, new ConsoleObserver(), root);
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

const isMain = () => {
  try {
    return (
      process.argv[1] &&
      fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
    );
  } catch {
    return false;
  }
};

if (isMain()) main();

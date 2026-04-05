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
import {
  OrbitSDK,
  type IOrbitSDK,
  type PulseInfo,
  type CapsuleInfo,
} from '../sdk/OrbitSDK.js';
import { getRepoConfig, detectRepoName } from '../core/ConfigManager.js';
import { ConsoleObserver } from '../core/Logger.js';
import { type StationReceipt } from '../core/interfaces.js';

function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export async function dispatch(argv: string[]): Promise<number> {
  const processedArgv = [...argv];

  function applyGlobalFlags(args: any): string {
    if (args.local) {
      process.env.GCLI_ORBIT_PROVIDER = 'local-worktree';
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
    if (args['for-station']) {
      process.env.GCLI_ORBIT_INSTANCE_NAME = args['for-station'];
      // AUTO-SWITCH: If a station is targeted and no provider is set, use GCE
      if (!process.env.GCLI_ORBIT_PROVIDER) {
        process.env.GCLI_ORBIT_PROVIDER = 'gce';
      }
    }
    if (args.schematic) process.env.GCLI_ORBIT_SCHEMATIC = args.schematic;
    if (args.verbose) process.env.GCLI_ORBIT_VERBOSE = '1';
    process.env.GCLI_ORBIT_SHIM = '1';
    return repoRoot;
  }

  function createSDK(args: any): IOrbitSDK {
    const root = applyGlobalFlags(args);
    const name = args.repo || detectRepoName(root);
    const config = getRepoConfig(name, args, root);
    return new OrbitSDK(config, consoleObserver, root);
  }

  /**
   * Shared helper for starting a mission from multiple CLI entry points.
   */
  async function runStartMission(args: any) {
    const sdk = createSDK(args);
    const action = args.action || args.verb || 'chat';
    const extra = args.extra || [];

    const result = await sdk.startMission({
      identifier: args.identifier || args.id,
      action,
      args: extra,
    });
    args.exitCode = result.exitCode;
  }

  // Shorthand for repo:cmd
  if (
    processedArgv[0] &&
    processedArgv[0].includes(':') &&
    !processedArgv[0].startsWith('-')
  ) {
    const [repo, actualCmd] = processedArgv[0].split(':');
    process.env.GCLI_ORBIT_REPO_NAME = repo;
    processedArgv[0] = actualCmd || '';
  }

  // Top-level Aliases (Plurals & High-velocity)
  const topAliases: Record<string, string> = {
    stations: 'station list',
    missions: 'mission start',
    schematics: 'infra schematic list',
    pulses: 'station pulse',
    provision: 'infra liftoff',
  };
  if (processedArgv[0]) {
    const alias = topAliases[processedArgv[0]];
    if (alias) {
      processedArgv.splice(0, 1, ...alias.split(' '));
    }
  }
  const parser = yargs(processedArgv)
    .scriptName('orbit')
    .usage('$0 <command> [args]')
    .demandCommand(1, 'Please specify a command.')
    .strict()

    .demandCommand(1, 'Please specify a command.')
    .showHelpOnFail(true)
    .exitProcess(false)
    .wrap(null)
    .strict()
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

    .group(['verbose', 'json'], 'Output Options:')
    .option('verbose', {
      type: 'boolean',
      description: 'Show detailed infrastructure logs',
    })
    .option('json', {
      type: 'boolean',
      description: 'Output raw JSON results',
    })

    // --- COMMANDS ---
    // 1. MISSION
    .command(
      'mission',
      'The Workflow: Start, uplink, attach, ci, or jettison.',
      (y: Argv) => {
        return (
          y
            // Default Mission command (Allows 'orbit mission <id> <verb>')
            .command(
              '$0 <identifier> [action] [extra..]',
              false,
              (y2) =>
                y2
                  .positional('identifier', {
                    type: 'string',
                    description: 'PR or Issue ID',
                  })
                  .positional('action', {
                    type: 'string',
                    default: 'chat',
                    description: 'Verb: chat, fix, review, implement',
                  }),
              async (args: any) => {
                // Safety: If identifier matches a subcommand, yargs should have picked it up.
                // But $0 is greedy, so we check here.
                const subcommands = [
                  'start',
                  'attach',
                  'uplink',
                  'ci',
                  'jettison',
                  'shell',
                  'reap',
                ];
                if (subcommands.includes(args.identifier)) {
                  // This shouldn't happen if yargs is configured correctly, but as a safeguard:
                  return;
                }
                await runStartMission(args);
              },
            )
            .command(
              'start <identifier> [action] [extra..]',
              'Start a new PR or Issue mission.',
              (y2) =>
                y2
                  .positional('identifier', {
                    type: 'string',
                    description: 'PR or Issue ID',
                  })
                  .positional('action', {
                    type: 'string',
                    default: 'chat',
                    description: 'Verb: chat, fix, review, implement',
                  }),
              runStartMission,
            )
            .command(
              'exec <identifier> <cmd>',
              'Execute a one-off command in the mission capsule.',
              (y2) => {
                y2.positional('identifier', { type: 'string' });
                y2.positional('cmd', { type: 'string' });
              },
              async (args: any) => {
                const sdk = createSDK(args);
                args.exitCode = await sdk.missionExec({
                  identifier: args.identifier,
                  command: args.cmd,
                });
              },
            )
            .command(
              'attach <identifier> [action]',
              'Resume an active mission.',
              (y2) =>
                y2
                  .positional('identifier', {
                    type: 'string',
                    description: 'PR or Issue ID',
                  })
                  .positional('action', {
                    type: 'string',
                    description: 'Verb: chat, fix, review, implement',
                  }),
              async (args: any) => {
                const sdk = createSDK(args);
                args.exitCode = await sdk.attach({
                  identifier: args.identifier,
                  action: args.action,
                });
              },
            )
            .command(
              'uplink <identifier> [action]',
              'Inspect mission telemetry.',
              (y2) =>
                y2
                  .positional('identifier', {
                    type: 'string',
                    description: 'PR or Issue ID',
                  })
                  .positional('action', {
                    type: 'string',
                    description: 'Specific playbook action',
                  }),
              async (args: any) => {
                const sdk = createSDK(args);
                args.exitCode = await sdk.getLogs({
                  identifier: args.identifier,
                  action: args.action,
                });
              },
            )
            .command(
              'ci <identifier>',
              'Monitor CI status for a branch.',
              (y2) =>
                y2.positional('identifier', {
                  type: 'string',
                  description: 'Branch or PR ID',
                }),
              async (args: any) => {
                const sdk = createSDK(args);
                const status = await sdk.monitorCI({ branch: args.identifier });
                console.log(
                  `CI Status: ${status.status} (${status.runs.join(', ')})`,
                );
                args.exitCode = status.status === 'FAILED' ? 1 : 0;
              },
            )
            .command(
              'jettison <identifier> [action]',
              'Decommission a specific mission.',
              (y2) =>
                y2
                  .positional('identifier', {
                    type: 'string',
                    description: 'PR or Issue ID',
                  })
                  .positional('action', {
                    type: 'string',
                    description: 'Verb: chat, fix, review, implement',
                  }),
              async (args: any) => {
                const sdk = createSDK(args);
                const res = await sdk.jettisonMission({
                  identifier: args.identifier,
                  action: args.action,
                });
                args.exitCode = res.exitCode;
              },
            )
            .command(
              'shell <identifier>',
              'Drop into a raw shell inside a mission capsule.',
              (y2) =>
                y2.positional('identifier', {
                  type: 'string',
                  description: 'PR or Issue ID',
                }),
              async (args: any) => {
                const sdk = createSDK(args);
                args.exitCode = await sdk.missionShell({
                  identifier: args.identifier,
                });
              },
            )
        );
      },
    )

    // 2. STATION
    .command(
      'station',
      'The Hardware: List, activate, hibernate, pulse, or reap.',
      (y: Argv) => {
        return y
          .command(
            ['list', 'ls'],
            'List all provisioned stations.',
            (y2) =>
              y2
                .option('sync', {
                  alias: 's',
                  type: 'boolean',
                  default: true,
                  description: 'Sync with reality (status and missions)',
                })
                .option('missions', {
                  alias: 'm',
                  type: 'boolean',
                  default: false,
                  description: 'Show high-fidelity mission status',
                }),
            async (args: any) => {
              const sdk = createSDK(args);
              const { sync, missions } = args;

              if (sync && !args.json) {
                process.stderr.write(
                  '📡 Synchronizing constellation . . . . .\n',
                );
              }

              const stations = await sdk.listStations({
                syncWithReality: sync,
                includeMissions: sync || missions,
              });

              let pulses: PulseInfo[] = [];
              if (missions && stations.length > 0) {
                // Convert StationInfo back to Receipts for the engine
                const receipts: StationReceipt[] = stations.map((s) => ({
                  name: s.name,
                  instanceName: s.name,
                  type: s.type,
                  projectId: s.projectId || 'local',
                  zone: s.zone || 'local',
                  repo: s.repo,
                  rootPath: s.rootPath,
                  lastSeen: s.lastSeen || new Date().toISOString(),
                }));
                pulses = await sdk.getFleetPulse(receipts);
              }

              if (args.json) {
                console.log(
                  JSON.stringify(missions ? pulses : stations, null, 2),
                );
                return;
              }

              console.log('\n🛰️  ORBIT CONSTELLATION');
              if (stations.length === 0) {
                console.log('   ✅ No provisioned stations found.');
                return;
              }

              const grouped = stations.reduce(
                (acc, s) => {
                  const repo = s.repo || 'unknown';
                  if (!acc[repo]) acc[repo] = [];
                  acc[repo].push(s);
                  return acc;
                },
                {} as Record<string, typeof stations>,
              );

              Object.entries(grouped).forEach(([repo, repoStations]) => {
                console.log(`\n📦 REPOSITORY: ${repo}`);
                repoStations.forEach((s) => {
                  const typeIcon = s.type === 'gce' ? '☁️' : '🏠';
                  const activeMarker = s.isActive ? '➡️' : '  ';
                  const status = s.status || 'READY';
                  const missionCount = (s.missions || []).length;
                  const project = s.projectId || 'local';
                  console.log(
                    `${activeMarker} ${typeIcon}  ${s.name.padEnd(20)} → ${status}, ${missionCount} missions, ${project}`,
                  );

                  if (missions) {
                    const pulse = pulses.find((p) => p.stationName === s.name);
                    if (pulse) {
                      renderPulseMissions(pulse, '      ');
                    }
                  }
                });
              });
            },
          )
          .command(
            ['activate <name>', 'use <name>'],
            'Set the active target station.',
            (y2) =>
              y2.positional('name', { type: 'string', demandOption: true }),
            async (args: any) => {
              const sdk = createSDK(args);
              await sdk.activateStation(args.name);
            },
          )
          .command(
            ['hibernate <name>', 'stop <name>'],
            'Stop station hardware without destroying it.',
            (y2) =>
              y2.positional('name', { type: 'string', demandOption: true }),
            async (args: any) => {
              const sdk = createSDK(args);
              await sdk.hibernate({ name: args.name });
            },
          )
          .command(
            'pulse',
            'Check health and mission status.',
            () => {},
            async (args: any) => {
              const sdk = createSDK(args);
              if (!args.json) {
                process.stderr.write('📡 Requesting status . . . . .\n');
              }

              let pulses: PulseInfo[] = [];

              // GLOBAL LOCAL PULSE: If run with --local and outside a repo
              if (args.local && !process.env.GCLI_ORBIT_REPO_NAME) {
                pulses = await sdk.getGlobalLocalPulse();
              } else {
                pulses = [await sdk.getPulse()];
              }

              if (args.json) {
                console.log(JSON.stringify(pulses, null, 2));
                return;
              }

              pulses.forEach((pulse) => {
                console.log(`\n🛰️  ORBIT PULSE: ${pulse.stationName}`);
                console.log(`   Repo Context: ${pulse.repoName}`);
                console.log('-'.repeat(80));
                console.log(`   - Station State:  ${pulse.status}`);
                if (pulse.internalIp)
                  console.log(`   - Internal IP:    ${pulse.internalIp}`);
                if (pulse.externalIp)
                  console.log(`   - External IP:    ${pulse.externalIp}`);

                renderPulseMissions(pulse, '   ');
                console.log('-'.repeat(80));
              });
            },
          )
          .command(
            'shell [name]',
            'Drop into a raw shell on the hardware host.',
            (y2) => y2.positional('name', { type: 'string' }),
            async (args: any) => {
              if (args.name) process.env.GCLI_ORBIT_INSTANCE_NAME = args.name;
              const sdk = createSDK(args);
              args.exitCode = await sdk.stationShell();
            },
          )
          .command(
            'reap',
            'Identify and remove idle missions.',
            (y2) =>
              y2
                .option('threshold', {
                  type: 'number',
                  description: 'Idle hours',
                })
                .option('force', { type: 'boolean' }),
            async (args: any) => {
              const sdk = createSDK(args);
              await sdk.reapMissions({
                threshold: args.threshold,
                force: args.force,
              });
            },
          )
          .command(
            ['delete <name>', 'rm <name>'],
            'Decommission Orbit hardware.',
            (y2) =>
              y2.positional('name', { type: 'string', demandOption: true }),
            async (args: any) => {
              const sdk = createSDK(args);
              await sdk.splashdown({ name: args.name });
            },
          )
          .demandCommand(1, 'Please specify a station action.');
      },
    )

    // 3. INFRA
    .command(
      'infra',
      'The Foundation: Liftoff, splashdown, or schematic.',
      (y: Argv) => {
        return y
          .command(
            'liftoff [name]',
            'Build or wake infrastructure.',
            (y2) =>
              y2
                .positional('name', { type: 'string' })
                .option('schematic', {
                  alias: 's',
                  type: 'string',
                  description: 'Blueprint to use',
                })
                .option('destroy', {
                  type: 'boolean',
                  description: 'Decommission infrastructure',
                }),
            async (args: any) => {
              process.env.GCLI_ORBIT_INSTANCE_NAME = args.name;
              const sdk = createSDK(args);
              args.exitCode = await sdk.provisionStation({
                schematicName: args.schematic,
                destroy: args.destroy,
              });
            },
          )
          .command(
            'splashdown [name]',
            'Emergency shutdown of Orbit infrastructure.',
            (y2) =>
              y2.positional('name', { type: 'string' }).option('all', {
                type: 'boolean',
                description: 'All active remote capsules',
              }),
            async (args: any) => {
              const sdk = createSDK(args);
              args.exitCode = await sdk.splashdown({
                name: args.name,
                all: args.all,
              });
            },
          )
          .command(
            'schematic <action> [name]',
            'Manage infrastructure blueprints.',
            (y2) =>
              y2
                .positional('action', {
                  choices: ['list', 'show', 'import', 'create', 'edit'],
                  demandOption: true,
                })
                .positional('name', {
                  type: 'string',
                  description: 'Schematic name or source',
                }),
            async (args: any) => {
              const sdk = createSDK(args);
              const sub = args.action;
              const sName = args.name;

              if (sub === 'list') {
                const schematics = sdk.listSchematics();
                if (args.json) {
                  console.log(JSON.stringify(schematics, null, 2));
                  return;
                }
                console.log('\n📐 ORBIT SCHEMATICS');
                console.log(
                  `   ${'NAME'.padEnd(20)} [PROJECT ID] [ZONE] (BACKEND)`,
                );
                schematics.forEach((s) => {
                  const project = s.projectId ? ` [${s.projectId}]` : '';
                  const zone = s.zone ? ` [${s.zone}]` : '';
                  const type = s.backendType ? ` (${s.backendType})` : '';
                  console.log(
                    `   ${s.name.padEnd(20)}${project}${zone}${type}`,
                  );
                });
              } else if (sub === 'show') {
                if (!sName) throw new Error('Schematic name required.');
                const config = sdk.getSchematic(sName);
                if (!config) {
                  if (args.json)
                    console.log(JSON.stringify({ error: 'Not found' }));
                  else console.error(`❌ Schematic "${sName}" not found.`);
                  args.exitCode = 1;
                  return;
                }
                if (args.json) {
                  console.log(JSON.stringify(config, null, 2));
                  return;
                }
                console.log(`\n📐 ORBIT SCHEMATIC: ${sName}`);
                console.log('-'.repeat(80));
                console.log(JSON.stringify(config, null, 2));
                console.log('-'.repeat(80));
              } else if (sub === 'import') {
                if (!sName) throw new Error('Source (file or URL) required.');
                const imported = await sdk.importSchematic(sName);
                if (args.json) console.log(JSON.stringify({ imported }));
                else console.log(`✅ Schematic "${imported}" imported.`);
              } else if (sub === 'create' || sub === 'edit') {
                if (!sName) throw new Error('Schematic name required.');
                await sdk.runSchematicWizard(sName, args);
              }
            },
          );
      },
    )

    // 4. CONFIG
    .command(
      'config',
      'The Local: Setup environment and integrations.',
      (y: Argv) => {
        return y
          .command(
            'install',
            'Install Orbit shell aliases and tab-completion.',
            () => {},
            async (args: any) => {
              const sdk = createSDK(args);
              await sdk.installShell();
            },
          )
          .command(
            'show',
            'Display resolved Orbit configuration.',
            () => {},
            async (args: any) => {
              const config = getRepoConfig();
              if (args.json) {
                console.log(JSON.stringify(config, null, 2));
                return;
              }
              console.log('\n🛠️  ORBIT RESOLVED CONFIG');
              console.log('-'.repeat(80));
              console.log(JSON.stringify(config, null, 2));
              console.log('-'.repeat(80));
            },
          )
          .demandCommand(1, 'Please specify a config action.');
      },
    );

  try {
    const result = await parser
      .fail((msg) => {
        throw new Error(msg);
      })
      .parse();
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

const consoleObserver = new ConsoleObserver();

/**
 * Shared formatter for mission status in Pulse/List
 */
function renderPulseMissions(pulse: PulseInfo, indent = ''): void {
  console.log(`\n${indent}📦 ACTIVE MISSION CAPSULES:`);
  if (pulse.capsules.length === 0) {
    console.log(`${indent}  - No mission capsules found`);
  } else {
    pulse.capsules.forEach((c: CapsuleInfo) => {
      let stateIcon = '💤';
      let detail = '';

      switch (c.state) {
        case 'THINKING':
          stateIcon = '🧠';
          detail = c.lastThought ? `Thought: ${c.lastThought}` : '';
          break;
        case 'WAITING_FOR_INPUT':
          stateIcon = '⏳';
          detail = c.lastQuestion
            ? `Question: ${c.lastQuestion}`
            : 'Waiting for input';
          break;
        case 'WAITING_FOR_APPROVAL':
          stateIcon = '🛑';
          detail = c.blocker || `Approval needed for ${c.pendingTool}`;
          break;
        case 'COMPLETED':
          stateIcon = '✅';
          detail = 'Mission complete';
          break;
        case 'WAITING':
          stateIcon = '⏳';
          break;
      }

      const statsStr =
        typeof c.stats === 'string'
          ? c.stats
          : `CPU: ${c.stats?.cpu || '0%'} MEM: ${c.stats?.memory || '0MB'}`;

      console.log(
        `${indent}  ${stateIcon} ${c.name.padEnd(30)} [${c.state}] ${statsStr}`,
      );
      if (detail) {
        console.log(`${indent}     └─ ${detail}`);
      }
    });
  }
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

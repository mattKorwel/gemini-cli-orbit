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
import { type StationState, type CapsuleInfo } from '../core/types.js';
import { getRepoConfig, detectRepoName } from '../core/ConfigManager.js';
import { ConsoleObserver } from '../core/Logger.js';

function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * --- GLOBAL OPTION HELPERS ---
 * Shared flag groups to ensure consistency across commands.
 */

function applyGlobalOptions(y: Argv) {
  return y
    .group(['verbose', 'json'], 'Global Options:')
    .option('verbose', {
      type: 'boolean',
      description: 'Show detailed infrastructure logs',
    })
    .option('json', {
      type: 'boolean',
      description: 'Output raw JSON results',
    });
}

function applyContextOptions(y: Argv) {
  return y
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
    });
}

function applyHardwareOptions(y: Argv) {
  return y
    .group(['for-station', 'schematic'], 'Hardware Targets:')
    .option('for-station', {
      type: 'string',
      description: 'Target a specific station instance',
    })
    .option('schematic', {
      type: 'string',
      description: 'The blueprint to use for liftoff',
    });
}

/**
 * Adds natural language guidance and friendly examples to a command's help.
 */
function applyFriendlyUsage(
  y: Argv,
  cmd: string,
  description: string,
  examples: [string, string][],
) {
  y.usage(`Usage: orbit ${cmd} [options]\n\n${description}`);
  examples.forEach(([example, desc]) => y.example(`orbit ${example}`, desc));
  return y;
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

  async function runConstellation(args: any) {
    const sdk = createSDK(args);
    const { sync, pulse, all, current, selectByName } = args;

    if ((sync || pulse) && !args.json) {
      process.stderr.write(
        `📡 ${pulse ? 'Requesting pulse' : 'Synchronizing'} constellation . . . . .\n`,
      );
    }

    let repoFilter: string | undefined = undefined;
    if (current || (!all && process.env.GCLI_ORBIT_REPO_NAME)) {
      repoFilter = process.env.GCLI_ORBIT_REPO_NAME;
    }

    const states = await sdk.getFleetState({
      syncWithReality: sync,
      includeMissions: pulse,
      repoFilter,
      nameFilter: selectByName,
    });

    if (args.json) {
      console.log(JSON.stringify(states, null, 2));
      return;
    }

    renderFleet(states, pulse ? 'pulse' : sync ? 'health' : 'inventory');
  }

  if (
    processedArgv[0] &&
    processedArgv[0].includes(':') &&
    !processedArgv[0].startsWith('-')
  ) {
    const [repo, actualCmd] = processedArgv[0].split(':');
    process.env.GCLI_ORBIT_REPO_NAME = repo;
    processedArgv[0] = actualCmd || '';
  }

  const topAliases: Record<string, string> = {
    stations: 'constellation',
    ls: 'constellation',
    missions: 'mission start',
    schematics: 'infra schematic list',
    pulse: 'constellation --pulse',
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
    .showHelpOnFail(true)
    .exitProcess(false)
    .wrap(null)
    .help()
    .alias('h', 'help')

    .command(
      ['constellation', 'ls'],
      'The Fleet View: Unified status and monitoring.',
      (y2) => {
        applyFriendlyUsage(
          y2,
          'constellation',
          "The Constellation is your mission control dashboard. It provides a real-time view of your fleet's health and active mission progress.\n\n💡 Tip: Constellation is context-aware. If you are inside a project folder, it filters to show only that project by default.",
          [
            [
              'constellation --pulse',
              'Deep dive into active mission logs and resource usage.',
            ],
            [
              'constellation -a',
              'See every station you have provisioned across all projects.',
            ],
          ],
        );

        y2.group(
          ['sync', 'pulse', 'all', 'current', 'select-by-name'],
          'Status Options:',
        )
          .option('sync', {
            alias: 's',
            type: 'boolean',
            default: true,
            description: 'Sync hardware health',
          })
          .option('pulse', {
            alias: 'p',
            type: 'boolean',
            default: false,
            description: 'Fetch deep mission telemetry',
          })
          .option('all', {
            alias: 'a',
            type: 'boolean',
            default: false,
            description: 'Show all registered stations',
          })
          .option('current', {
            alias: 'c',
            type: 'boolean',
            default: false,
            description: 'Limit to current repo',
          })
          .option('select-by-name', {
            alias: 'n',
            type: 'string',
            description: 'Filter stations by name pattern',
          });

        return applyGlobalOptions(applyContextOptions(y2));
      },
      runConstellation,
    )

    .command(
      'mission',
      'The Workflow: Launch or resume isolated developer presence.',
      (y: Argv) => {
        return y
          .command(
            [
              '$0 <identifier> [action] [extra..]',
              'start <identifier> [action] [extra..]',
            ],
            'Start or resume a mission.',
            (y2) => {
              applyFriendlyUsage(
                y2,
                'mission start <id>',
                'Missions are the core of Orbit. They provide the isolation and behavioral proof needed for autonomous work. Launching a mission creates a dedicated workspace and agent container.',
                [
                  [
                    'mission 123 review',
                    'Start an autonomous PR review for PR #123.',
                  ],
                  [
                    'mission 456 chat',
                    'Drop into a persistent terminal session with Gemini.',
                  ],
                  [
                    'mission fix-tests fix',
                    'Start an iterative fix-loop for a specific branch.',
                  ],
                ],
              );
              y2.positional('identifier', {
                type: 'string',
                description: 'PR or Issue ID',
              }).positional('action', {
                type: 'string',
                default: 'chat',
                description: 'Verb: chat, fix, review, implement',
              });
              return applyGlobalOptions(
                applyHardwareOptions(applyContextOptions(y2)),
              );
            },
            async (args: any) => {
              const subcommands = [
                'start',
                'attach',
                'uplink',
                'ci',
                'jettison',
                'shell',
                'reap',
                'exec',
              ];
              if (subcommands.includes(args.identifier)) return;
              await runStartMission(args);
            },
          )
          .command(
            'exec <identifier> <cmd>',
            'Execute a one-off command in the mission capsule.',
            (y2) => {
              y2.positional('identifier', { type: 'string' }).positional(
                'cmd',
                { type: 'string' },
              );
              return applyGlobalOptions(
                applyHardwareOptions(applyContextOptions(y2)),
              );
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
            (y2) => {
              y2.positional('identifier', { type: 'string' }).positional(
                'action',
                { type: 'string' },
              );
              return applyGlobalOptions(
                applyHardwareOptions(applyContextOptions(y2)),
              );
            },
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
            (y2) => {
              y2.positional('identifier', { type: 'string' }).positional(
                'action',
                { type: 'string' },
              );
              return applyGlobalOptions(
                applyHardwareOptions(applyContextOptions(y2)),
              );
            },
            async (args: any) => {
              const sdk = createSDK(args);
              args.exitCode = await sdk.getLogs({
                identifier: args.identifier,
                action: args.action,
              });
            },
          )
          .command(
            'jettison <identifier> [action]',
            'Decommission a specific mission.',
            (y2) => {
              y2.positional('identifier', { type: 'string' }).positional(
                'action',
                { type: 'string' },
              );
              return applyGlobalOptions(
                applyHardwareOptions(applyContextOptions(y2)),
              );
            },
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
            (y2) => {
              y2.positional('identifier', { type: 'string' });
              return applyGlobalOptions(
                applyHardwareOptions(applyContextOptions(y2)),
              );
            },
            async (args: any) => {
              const sdk = createSDK(args);
              args.exitCode = await sdk.missionShell({
                identifier: args.identifier,
              });
            },
          );
      },
    )

    .command(
      'station',
      'The Hardware: Lifecycle and Management.',
      (y: Argv) => {
        return y
          .command(
            ['activate <name>', 'use <name>'],
            'Set the active target station.',
            (y2) => {
              applyFriendlyUsage(
                y2,
                'station activate <name>',
                'Targets a specific station for all future missions. This updates your local settings for the current project.',
                [
                  [
                    'station activate my-gce-vm',
                    'Set your remote VM as the primary mission target.',
                  ],
                ],
              );
              return applyGlobalOptions(
                applyContextOptions(
                  y2.positional('name', { type: 'string', demandOption: true }),
                ),
              );
            },
            async (args: any) => {
              const sdk = createSDK(args);
              await sdk.activateStation(args.name);
            },
          )
          .command(
            ['hibernate <name>', 'stop <name>'],
            'Stop station hardware.',
            (y2) => {
              applyFriendlyUsage(
                y2,
                'station hibernate <name>',
                'Safely stops the compute instance to save costs without destroying your data or workspaces.',
                [['station hibernate my-vm', 'Stop the remote instance.']],
              );
              return applyGlobalOptions(
                applyContextOptions(
                  y2.positional('name', { type: 'string', demandOption: true }),
                ),
              );
            },
            async (args: any) => {
              const sdk = createSDK(args);
              await sdk.hibernate({ name: args.name });
            },
          )
          .command(
            'shell [name]',
            'Drop into a raw shell on the hardware host.',
            (y2) =>
              applyGlobalOptions(
                applyHardwareOptions(
                  applyContextOptions(
                    y2.positional('name', { type: 'string' }),
                  ),
                ),
              ),
            async (args: any) => {
              if (args.name) process.env.GCLI_ORBIT_INSTANCE_NAME = args.name;
              const sdk = createSDK(args);
              args.exitCode = await sdk.stationShell();
            },
          )
          .command(
            'reap',
            'Identify and remove idle missions.',
            (y2) => {
              applyFriendlyUsage(
                y2,
                'station reap',
                'Scans for missions that have been idle for a long period and surgically removes their capsules.',
                [
                  [
                    'station reap --threshold 24',
                    'Cleanup missions idle for more than a day.',
                  ],
                ],
              );
              return applyGlobalOptions(
                applyHardwareOptions(
                  applyContextOptions(
                    y2
                      .option('threshold', {
                        type: 'number',
                        description: 'Idle hours',
                      })
                      .option('force', { type: 'boolean' }),
                  ),
                ),
              );
            },
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
            (y2) => {
              applyFriendlyUsage(
                y2,
                'station delete <name>',
                'PERMANENTLY DELETES all cloud resources (Disks, VPCs, VMs) for the station. This cannot be undone.',
                [
                  [
                    'station delete my-old-vm',
                    'Full decommissioning of a station.',
                  ],
                ],
              );
              return applyGlobalOptions(
                applyHardwareOptions(
                  applyContextOptions(
                    y2.positional('name', {
                      type: 'string',
                      demandOption: true,
                    }),
                  ),
                ),
              );
            },
            async (args: any) => {
              const sdk = createSDK(args);
              await sdk.splashdown({ name: args.name });
            },
          )
          .demandCommand(1, 'Please specify a station action.');
      },
    )

    .command(
      'infra',
      'The Foundation: Liftoff, splashdown, or schematic.',
      (y: Argv) => {
        return y
          .command(
            'liftoff [name]',
            'Build or wake infrastructure.',
            (y2) => {
              applyFriendlyUsage(
                y2,
                'infra liftoff',
                "Liftoff is idempotent. It creates a new station if it doesn't exist, wakes it if it's hibernating, and ensures it has the latest extension code.",
                [
                  [
                    'infra liftoff my-vm --schematic dev-box',
                    'Provision a new station using a specific blueprint.',
                  ],
                ],
              );
              const yLocal = y2
                .positional('name', { type: 'string' })
                .option('schematic', {
                  alias: 's',
                  type: 'string',
                  description: 'Blueprint to use',
                })
                .option('destroy', {
                  type: 'boolean',
                  description: 'Decommission infrastructure',
                });
              return applyGlobalOptions(applyContextOptions(yLocal));
            },
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
            'schematic <action> [name]',
            'Manage infrastructure blueprints.',
            (y2) => {
              const yLocal = y2
                .positional('action', {
                  choices: ['list', 'show', 'import', 'create', 'edit'],
                  demandOption: true,
                })
                .positional('name', {
                  type: 'string',
                  description: 'Schematic name or source',
                });
              return applyGlobalOptions(applyContextOptions(yLocal));
            },
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

    .command(
      'config',
      'The Local: Setup environment and integrations.',
      (y: Argv) => {
        return y
          .command(
            'install',
            'Install Orbit shell aliases.',
            (y2) => applyGlobalOptions(y2),
            async (args: any) => {
              const sdk = createSDK(args);
              await sdk.installShell();
            },
          )
          .command(
            'show',
            'Display resolved configuration.',
            (y2) => applyGlobalOptions(y2),
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

function renderFleet(
  states: StationState[],
  depth: 'inventory' | 'health' | 'pulse',
) {
  if (depth === 'pulse') {
    states.forEach((s) => {
      console.log(`\n🛰️  ORBIT PULSE: ${s.receipt.name}`);
      console.log(`   Repo Context: ${s.receipt.repo}`);
      console.log('-'.repeat(80));
      if (s.reality) {
        console.log(`   - Station State:  ${s.reality.status}`);
        if (s.reality.internalIp)
          console.log(`   - Internal IP:    ${s.reality.internalIp}`);
        if (s.reality.externalIp)
          console.log(`   - External IP:    ${s.reality.externalIp}`);
        renderMissionList(s.reality.missions, '   ');
      } else {
        console.log('   (Status unavailable - No reality sync)');
      }
      console.log('-'.repeat(80));
    });
  } else {
    console.log('\n🌌 ORBIT CONSTELLATION');
    if (states.length === 0) {
      console.log('   ✅ No provisioned stations found.');
      return;
    }

    const grouped = states.reduce(
      (acc, s) => {
        const repo = s.receipt.repo || 'unknown';
        if (!acc[repo]) acc[repo] = [];
        acc[repo].push(s);
        return acc;
      },
      {} as Record<string, typeof states>,
    );

    Object.entries(grouped).forEach(([repo, repoStations]) => {
      console.log(`\n📦 REPOSITORY: ${repo}`);
      repoStations.forEach((s) => {
        const typeIcon = s.receipt.type === 'gce' ? '☁️' : '🏠';
        const activeMarker = s.isActive ? '➡️' : '  ';
        const status = s.reality?.status || s.receipt.status || 'READY';
        const project = s.receipt.projectId || 'local';
        const missionCount =
          s.reality?.missions.length ?? (depth === 'inventory' ? '?' : 0);

        console.log(
          `${activeMarker} ${typeIcon}  ${s.receipt.name.padEnd(20)} → ${status}, ${missionCount} missions, ${project}`,
        );
      });
    });
  }
}

function renderMissionList(capsules: CapsuleInfo[], indent = ''): void {
  console.log(`\n${indent}📦 ACTIVE MISSION CAPSULES:`);
  if (capsules.length === 0) {
    console.log(`${indent}  - No mission capsules found`);
  } else {
    capsules.forEach((c) => {
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

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

// --- CORE IMPORTS ---
import {
  OrbitSDK,
  type OrbitObserver,
  type IOrbitSDK,
} from '../core/OrbitSDK.js';
import { getRepoConfig, detectRepoName } from '../core/ConfigManager.js';
import { LogLevel } from '../core/Logger.js';

import { runFleet } from '../core/fleet.js';

/**
 * Expands a tilde (~) in a path string to the user's home directory.
 */
function expandPath(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

// --- CLI OBSERVER ---
class ConsoleObserver implements OrbitObserver {
  onLog(level: LogLevel, tag: string, message: string): void {
    const tagStr = tag ? `[${tag.padEnd(8)}] ` : '';
    if (level === LogLevel.ERROR) console.error(`❌ ${tagStr}${message}`);
    else if (level === LogLevel.WARN) console.warn(`⚠️  ${tagStr}${message}`);
    else if (level === LogLevel.INFO) console.log(`${tagStr}${message}`);
  }

  onProgress(phase: string, message: string): void {
    console.log(`\n--- ${phase} ---`);
    console.log(`   ${message}`);
  }

  onDivider(title?: string): void {
    const width = 80;
    if (title) {
      const padding = Math.max(0, Math.floor((width - title.length - 2) / 2));
      console.log(
        `\n${'-'.repeat(padding)} ${title} ${'-'.repeat(width - padding - title.length - 2)}`,
      );
    } else {
      console.log(`\n${'-'.repeat(width)}`);
    }
  }
}

/**
 * Main CLI entry point using Yargs for declarative command routing.
 */
export async function dispatch(argv: string[]): Promise<number> {
  // Pre-process for repo:cmd shorthand
  const processedArgv = [...argv];
  if (
    processedArgv[0] &&
    processedArgv[0].includes(':') &&
    !processedArgv[0].startsWith('-')
  ) {
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
    .exitProcess(false)
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
        const sdk = createSDK(args);
        const result = await sdk.startMission({
          identifier: args.identifier,
          action: args.action,
          args: args._.map(String).slice(1),
        });
        args.exitCode = result.exitCode;
      },
    )
    .command(
      'schematic <action> [name]',
      'Manage infrastructure blueprints.',
      (y) => {
        return y
          .positional('action', {
            choices: ['list', 'create', 'edit', 'import'],
            demandOption: true,
          })
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
        const sdk = createSDK(args);
        if (args.action === 'list') {
          const schematics = sdk.listSchematics();
          console.log('\n📐 ORBIT INFRASTRUCTURE SCHEMATICS');
          console.log('--------------------------------------------------');
          if (schematics.length === 0) {
            console.log('   (No schematics found)');
          } else {
            schematics.forEach((s) => console.log(`   ${s}`));
          }
          console.log('--------------------------------------------------');
          console.log('Use "orbit schematic create <name>" to run wizard.\n');
          args.exitCode = 0;
          return;
        }

        if (args.action === 'import' && args.name) {
          await sdk.importSchematic(args.name);
          args.exitCode = 0;
          return;
        }

        // Headless update via SDK
        if ((args.action === 'create' || args.action === 'edit') && args.name) {
          const knownKeys = [
            'projectId',
            'zone',
            'vpcName',
            'subnetName',
            'instanceName',
            'machineType',
          ];
          const cleanFlags: any = {};
          let hasFlags = false;
          for (const key of knownKeys) {
            if ((args as any)[key] !== undefined) {
              cleanFlags[key] = (args as any)[key];
              hasFlags = true;
            }
          }
          if (args.backend) {
            cleanFlags.backendType = args.backend;
            hasFlags = true;
          }
          if (args.image) {
            cleanFlags.imageUri = args.image;
            hasFlags = true;
          }

          if (hasFlags) {
            await sdk.saveSchematic(args.name, cleanFlags);
            args.exitCode = 0;
            return;
          }
        }

        // wizard still uses legacy runFleet for interactivity for now
        const configFlags = {
          ...args,
          backendType: args.backend as any,
          imageUri: args.image as any,
        };
        args.exitCode = await runFleet(
          ['schematic', args.action, args.name || ''],
          configFlags as any,
        );
      },
    )
    .command(
      'station <action> [name]',
      'Hardware control: <activate|list|liftoff|hibernate>',
      (y) => {
        return y
          .positional('action', {
            choices: ['list', 'activate', 'liftoff', 'hibernate'],
            demandOption: true,
          })
          .positional('name', { type: 'string' })
          .option('setup-net', { type: 'boolean' })
          .option('with-new-station', { type: 'boolean' })
          .option('sync', {
            alias: 's',
            type: 'boolean',
            description: 'Sync with reality',
          });
      },
      async (args) => {
        const sdk = createSDK(args);
        if (args.action === 'activate' && args.name) {
          await sdk.activateStation(args.name);
          args.exitCode = 0;
          return;
        }

        if (args.action === 'hibernate' && args.name) {
          await sdk.hibernate({ name: args.name });
          args.exitCode = 0;
          return;
        }

        if (args.action === 'list') {
          const stations = await sdk.listStations({
            syncWithReality: args.sync as boolean,
          });
          sdk.observer.onDivider?.('ORBIT CONSTELLATION');

          if (stations.length === 0) {
            console.log('✅ No provisioned stations found.');
            args.exitCode = 0;
            return;
          }

          stations.forEach((s) => {
            const typeIcon = s.type === 'gce' ? '☁️ ' : '🏠';
            const statusLabel = s.status ? `[${s.status}]` : '';
            console.log(
              `${s.isActive ? '➡️ ' : '  '} ${typeIcon} ${s.name.padEnd(30)} ${statusLabel.padEnd(12)} [${s.repo}]`,
            );
            if (s.missions && s.missions.length > 0) {
              console.log('   📦 Active Missions:');
              s.missions.forEach((m) => console.log(`      • ${m}`));
            }
            if (s.type === 'gce')
              console.log(`   - Project: ${s.projectId} | Zone: ${s.zone}`);
            else console.log(`   - Path: ${s.rootPath}`);
            console.log(`   - Last Seen: ${s.lastSeen}\n`);
          });
          args.exitCode = 0;
          return;
        }

        if (args.action === 'liftoff') {
          args.exitCode = await sdk.provisionStation({
            schematicName: args.name,
          });
          return;
        }

        // Catch-all for legacy runFleet if any
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
        const sdk = createSDK(args);
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

        if (pulse.status === 'RUNNING') {
          console.log(`\n📦 ACTIVE MISSION CAPSULES:`);
          if (pulse.capsules.length > 0) {
            pulse.capsules.forEach((c) => {
              let label = '💤 [IDLE]    ';
              if (c.state === 'WAITING') label = '✋ [WAITING] ';
              if (c.state === 'THINKING') label = '🧠 [THINKING]';
              console.log(
                `     ${label} ${c.name.padEnd(20)} | ${c.stats || ''}`,
              );
            });
          } else {
            console.log('     - No mission capsules found');
          }
        }
        console.log('-'.repeat(80) + '\n');
        args.exitCode = 0;
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
        const sdk = createSDK(args);
        args.exitCode = await sdk.getLogs({
          identifier: args.identifier,
          action: args.action,
        });
      },
    )
    .command(
      'ci [branch]',
      'Monitor CI status for a branch with noise filtering.',
      (y) => {
        return y.positional('branch', { type: 'string' });
      },
      async (args) => {
        const sdk = createSDK(args);
        const status = await sdk.monitorCI({ branch: args.branch });
        console.log(`CI Status: ${status.status} (${status.runs.join(', ')})`);
        if (status.failures) {
          for (const [cat, fails] of status.failures.entries()) {
            console.log(`\n[${cat}]`);
            fails.forEach((f) => console.log(`  - ${f}`));
          }
        }
        args.exitCode = status.status === 'FAILED' ? 1 : 0;
      },
    )
    .command(
      'jettison <identifier> [action]',
      'Decommission a specific mission and its worktree.',
      (y) => {
        return y
          .positional('identifier', { type: 'string', demandOption: true })
          .positional('action', { type: 'string', default: 'chat' })
          .option('yes', {
            alias: 'y',
            type: 'boolean',
            description: 'Bypass confirmation',
          });
      },
      async (args) => {
        const sdk = createSDK(args);
        const res = await sdk.jettisonMission({
          identifier: args.identifier,
          action: args.action,
        });
        args.exitCode = res.exitCode;
      },
    )
    .command(
      'reap',
      'Cleanup idle mission capsules based on inactivity.',
      (y) => {
        return y
          .option('threshold', {
            type: 'number',
            description: 'Idle threshold in hours',
          })
          .option('force', { type: 'boolean', description: 'Force cleanup' });
      },
      async (args) => {
        const sdk = createSDK(args);
        await sdk.reapMissions({
          threshold: args.threshold as number,
          force: args.force as boolean,
        });
        args.exitCode = 0;
      },
    )
    .command(
      'splashdown [name]',
      'Emergency shutdown of missions or full decommissioning of a station.',
      (y) => {
        return y
          .positional('name', {
            type: 'string',
            description: 'Decommission a specific station VM and receipt',
          })
          .option('all', {
            type: 'boolean',
            description: 'Stop the active station VM as well',
          });
      },
      async (args) => {
        const sdk = createSDK(args);
        args.exitCode = await sdk.splashdown({
          name: args.name as string,
          all: args.all as boolean,
        });
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
        const sdk = createSDK(args);
        args.exitCode = await sdk.attach({
          identifier: args.identifier,
          action: args.action,
        });
      },
    )
    .command(
      'install-shell',
      'Install Orbit shell aliases and tab-completion.',
      {},
      async (args) => {
        const sdk = createSDK(args);
        await sdk.installShell();
        args.exitCode = 0;
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
          .option('destroy', {
            type: 'boolean',
            description: 'Decommission infrastructure',
          });
      },
      async (args) => {
        const sdk = createSDK(args);
        args.exitCode = await sdk.provisionStation({
          schematicName: args.schematic,
          destroy: args.destroy as boolean,
        });
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

  function createSDK(args: any): IOrbitSDK {
    applyGlobalFlags(args);
    const repoName = args.repo || detectRepoName();
    const config = getRepoConfig(repoName, args);
    return new OrbitSDK(config, new ConsoleObserver());
  }

  try {
    const result = await parser.parse();
    return (result as any).exitCode ?? 0;
  } catch (err: any) {
    if (err.exitCode !== undefined) {
      return err.exitCode;
    }
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

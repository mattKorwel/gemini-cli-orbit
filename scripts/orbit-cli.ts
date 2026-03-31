/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Orbit CLI
 * Unified entry point that routes commands to core functions.
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// --- CORE IMPORTS ---
import { runOrchestrator } from './orchestrator.js';
import { runFleet } from './fleet.js';
import { runStatus } from './status.js';
import { runJettison } from './jettison.js';
import { runSetup } from './setup.js';
import { runSplashdown } from './splashdown.js';
import { runReap } from './reap.js';
import { runCI } from './ci.js';
import { runLogs } from './logs.js';
import { runAttach } from './attach.js';
import { runInstallShell } from './install-shell.js';
import { ACCEPTED_FLAGS } from './ConfigManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the Extension Root.
 */
function resolveRoot(): string {
  let current = __dirname;
  while (current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.resolve(__dirname, '..');
}

// Resolve the root folder
resolveRoot();

type Runner = (args: string[]) => Promise<number | void>;

interface Command {
  run: Runner;
  description: string;
  category?: 'Primary' | 'Telemetry' | 'Cleanup' | 'Setup';
  usage?: string;
  examples?: string[];
}

const COMMANDS: Record<string, Command> = {
  mission: {
    run: runOrchestrator,
    category: 'Primary',
    description: 'Launch or resume an isolated developer presence.',
    usage: 'orbit mission <PR | ExistingBranch | NewBranch> [action|prompt...]',
    examples: [
      'orbit mission 21          (Interactive chat session)',
      'orbit mission 21 review   (Autonomous PR review)',
      'orbit mission 21 fix      (Iterative CI repair)',
      'orbit mission 21 shell    (Raw bash shell)',
    ],
  },
  schematic: {
    run: (args) => runFleet(['schematic', ...args]),
    category: 'Primary',
    description: 'Manage infrastructure blueprints: <list|create|edit|import>',
    usage: 'orbit schematic <list|create|edit|import> [name]',
    examples: [
      'orbit schematic list',
      'orbit schematic create corp',
      'orbit schematic import ./blueprint.json',
    ],
  },
  station: {
    run: (args) => runFleet(['station', ...args]),
    category: 'Primary',
    description: 'Hardware control: <activate|list|liftoff|delete>',
    usage: 'orbit station <list|activate|liftoff|delete> [name]',
    examples: [
      'orbit station list',
      'orbit station activate corp-vm',
      'orbit station liftoff corp --setup-net',
      'orbit station delete corp-vm',
    ],
  },
  pulse: {
    run: (_args) => runStatus(),
    category: 'Primary',
    description: 'Check station health and active mission status.',
    usage: 'orbit pulse',
  },
  uplink: {
    run: runLogs,
    category: 'Telemetry',
    description: 'Inspect local or remote mission telemetry.',
    usage: 'orbit uplink <IDENTIFIER> [action]',
    examples: ['orbit uplink 21', 'orbit uplink 21 fix'],
  },
  ci: {
    run: runCI,
    category: 'Telemetry',
    description: 'Monitor CI status for a branch with noise filtering.',
    usage: 'orbit ci [branch]',
  },
  jettison: {
    run: runJettison,
    category: 'Cleanup',
    description: 'Decommission a specific mission and its worktree.',
    usage: 'orbit jettison <IDENTIFIER> [action]',
  },
  reap: {
    run: (_args) => runReap(),
    category: 'Cleanup',
    description: 'Cleanup idle mission capsules based on inactivity.',
    usage: 'orbit reap',
  },
  splashdown: {
    run: runSplashdown,
    category: 'Cleanup',
    description: 'Emergency shutdown of all active remote capsules.',
    usage: 'orbit splashdown [--all]',
  },
  attach: {
    run: runAttach,
    category: 'Telemetry',
    description: 'Attach to an active mission session.',
    usage: 'orbit attach <IDENTIFIER> [action]',
  },
  'install-shell': {
    run: () => runInstallShell(),
    category: 'Setup',
    description: 'Install Orbit shell aliases and tab-completion.',
    usage: 'orbit install-shell',
  },
  // Aliases (Hidden from main help)
  install_shell: {
    run: () => runInstallShell(),
    description: 'Alias for install-shell',
  },
  liftoff: {
    run: (args) => runSetup(args),
    description: 'Alias for station liftoff',
  },
};

function showHelp(cmdName?: string) {
  if (cmdName && COMMANDS[cmdName]) {
    const cmd = COMMANDS[cmdName];
    console.log(`\n🚀 ORBIT COMMAND: ${cmdName.toUpperCase()}`);
    console.log(`--------------------------------------------------`);
    console.log(`Description: ${cmd.description}`);
    if (cmd.usage) console.log(`Usage:       ${cmd.usage}`);

    // Dynamic Flags for schematic/station
    if (cmdName === 'schematic' || cmdName === 'station') {
      console.log('\nAccepted Configuration Flags:');
      ACCEPTED_FLAGS.forEach((f) => {
        console.log(`  --${f.flag.padEnd(15)} ${f.desc}`);
      });
      console.log('  (Use --key=value syntax)');
    }

    if (cmd.examples && cmd.examples.length > 0) {
      console.log(`\nExamples:`);
      cmd.examples.forEach((ex) => console.log(`  ${ex}`));
    }
    console.log('');
    return;
  }

  console.log('\n🚀 GEMINI ORBIT - Command Line Interface\n');
  console.log('Usage: orbit <command> [args]\n');

  const categories: Command['category'][] = [
    'Primary',
    'Telemetry',
    'Cleanup',
    'Setup',
  ];

  categories.forEach((cat) => {
    console.log(`${cat} Commands:`);
    Object.entries(COMMANDS)
      .filter(([_, info]) => info.category === cat)
      .forEach(([name, info]) => {
        console.log(`  ${name.padEnd(12)} - ${info.description}`);
      });
    console.log('');
  });

  console.log('Global Flags:');
  console.log('  -h, --help        Show this help menu');
  console.log('  -l, --local       Force local worktree mode');
  console.log('  --for-station <s> Target a specific station');
  console.log('  --schematic <s>   Use a specific schematic for liftoff');

  console.log('\nTip: Use "orbit <command> --help" for detailed usage.\n');
}

async function main() {
  const rawArgs = process.argv.slice(2);
  let cmd = rawArgs[0];

  // Handle universal repo:cmd shorthand (e.g., orbit dotfiles:pulse)
  if (cmd && cmd.includes(':')) {
    const [repo, actualCmd] = cmd.split(':');
    if (actualCmd) {
      process.env.GCLI_ORBIT_REPO_NAME = repo;
      cmd = actualCmd;
      rawArgs[0] = cmd;
    }
  }

  if (!cmd || cmd === '-h' || cmd === '--help') {
    showHelp();
    process.exit(0);
  }

  const commandInfo = COMMANDS[cmd];
  if (!commandInfo && cmd && !cmd.startsWith('-')) {
    console.error(`\n❌ Unrecognized command: "${cmd}"`);
    showHelp();
    process.exit(1);
  }

  if (!commandInfo) {
    showHelp();
    process.exit(1);
  }

  // Handle --help for specific command
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    showHelp(cmd);
    process.exit(0);
  }

  // --- 🧼 GLOBAL FLAG CONSUMPTION ---
  const cleanArgs: string[] = [];
  for (let i = 1; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === undefined) continue;

    if (arg === '--local' || arg === '-l') {
      process.env.GCLI_ORBIT_PROVIDER = 'local-worktree';
      process.env.GCLI_MCP = '0';
    } else if ((arg === '--repo' || arg === '-r') && rawArgs[i + 1]) {
      process.env.GCLI_ORBIT_REPO_NAME = rawArgs[i + 1]!;
      i++;
    } else if (
      arg.startsWith('--for-station=') ||
      (arg === '--for-station' && rawArgs[i + 1])
    ) {
      const val = arg.includes('=') ? arg.split('=')[1]! : rawArgs[i + 1]!;
      process.env.GCLI_ORBIT_INSTANCE_NAME = val;
      if (!arg.includes('=')) i++;
    } else if (
      arg.startsWith('--schematic=') ||
      (arg === '--schematic' && rawArgs[i + 1])
    ) {
      const val = arg.includes('=') ? arg.split('=')[1]! : rawArgs[i + 1]!;
      process.env.GCLI_ORBIT_SCHEMATIC = val;
      if (!arg.includes('=')) i++;
    } else {
      cleanArgs.push(arg);
    }
  }

  // Ensure CLI knows it is a command to bypass interactive UI
  process.env.GCLI_ORBIT_SHIM = '1';

  try {
    const code = await commandInfo.run(cleanArgs);
    process.exit(code ?? 0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();

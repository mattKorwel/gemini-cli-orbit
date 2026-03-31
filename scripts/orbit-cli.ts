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

const ROOT = resolveRoot();

type Runner = (args: string[]) => Promise<number | void>;

const COMMANDS: Record<string, { run: Runner; description: string }> = {
  mission: {
    run: runOrchestrator,
    description: 'Start, resume, or perform maneuvers on a PR mission.',
  },
  schematic: {
    run: (args) => runFleet(['schematic', ...args]),
    description: 'Manage infrastructure blueprints: <list|create|edit|import>',
  },
  station: {
    run: (args) => runFleet(['station', ...args]),
    description: 'Hardware control: <activate|list|liftoff|delete>',
  },
  liftoff: {
    run: (args) => runSetup(args),
    description: 'Build or wake infrastructure (use --with-station).',
  },
  ci: {
    run: runCI,
    description: 'Monitor CI status for a branch with noise filtering.',
  },
  pulse: {
    run: (_args) => runStatus(),
    description: 'Check station health and active mission status.',
  },
  uplink: {
    run: runLogs,
    description: 'Inspect local or remote mission telemetry.',
  },
  splashdown: {
    run: runSplashdown,
    description: 'Emergency shutdown of all active remote capsules.',
  },
  jettison: {
    run: runJettison,
    description: 'Decommission a specific mission and its worktree.',
  },
  reap: {
    run: (args) => {
      // Reap expects options object, we can adapt here or in reap.ts
      return runReap();
    },
    description: 'Cleanup idle mission capsules based on inactivity.',
  },
  attach: {
    run: runAttach,
    description: 'Attach to an active mission session.',
  },
  'install-shell': {
    run: () => runInstallShell(),
    description: 'Install Orbit shell aliases and tab-completion.',
  },
  install_shell: {
    run: () => runInstallShell(),
    description: 'Install Orbit shell aliases and tab-completion.',
  },
};

function showHelp() {
  console.log('\n🚀 GEMINI ORBIT - Command Line Interface\n');
  console.log('Usage: orbit <command> [args]\n');

  console.log('Primary Commands:');
  console.log(
    '  mission      - Start, resume, or perform maneuvers on a PR mission.',
  );
  console.log(
    '  schematic    - Manage infrastructure blueprints: <list|create|edit|import>',
  );
  console.log(
    '  station      - Hardware control: <activate|list|liftoff|delete>',
  );
  console.log(
    '  pulse        - Check station health and active mission status.',
  );

  console.log('\nTelemetry & Progress:');
  console.log('  uplink       - Inspect local or remote mission telemetry.');
  console.log(
    '  ci           - Monitor CI status for a branch with noise filtering.',
  );

  console.log('\nCleanup & Maintenance:');
  console.log(
    '  jettison     - Decommission a specific mission and its worktree.',
  );
  console.log(
    '  reap         - Cleanup idle mission capsules based on inactivity.',
  );
  console.log(
    '  splashdown   - Emergency shutdown of all active remote capsules.',
  );

  console.log('\nSetup:');
  console.log('  install-shell- Install shell aliases and tab-completion.');

  console.log('\nGlobal Flags:');
  console.log('  -h, --help        Show this help menu');
  console.log('  -l, --local       Force local worktree mode');
  console.log('  --for-station <s> Target a specific station');
  console.log('  --schematic <s>   Use a specific schematic for liftoff');

  console.log('\nExample:');
  console.log('  orbit mission 21 review   (Autonomous PR review)');
  console.log('  orbit mission 21          (Interactive chat session)');
  console.log('  orbit schematic create corp');
  console.log('');
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

  // --- 🧼 GLOBAL FLAG CONSUMPTION ---
  const cleanArgs: string[] = [];
  for (let i = 1; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === undefined) continue;

    if (arg === '--local' || arg === '-l') {
      process.env.GCLI_ORBIT_PROVIDER = 'local-worktree';
      process.env.GCLI_MCP = '0';
    } else if ((arg === '--repo' || arg === '-r') && rawArgs[i + 1]) {
      process.env.GCLI_ORBIT_REPO_NAME = rawArgs[i + 1];
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

#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Orbit CLI Shim
 * Standardizes argument parsing and routes commands to bundled entrypoints.
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the Extension Root.
 * Works for:
 * - Local Dev: scripts/orbit-shim.ts
 * - Bundled: bundle/orbit-shim.js
 * - Global Install: ~/.gemini/extensions/orbit/...
 */
function resolveRoot(): string {
  let current = __dirname;
  while (current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    current = path.dirname(current);
  }
  // Fallback to parent of shim location
  return path.resolve(__dirname, '..');
}

const ROOT = resolveRoot();

const COMMANDS: Record<string, { script: string; description: string }> = {
  mission: {
    script: 'mission.ts',
    description: 'Start, resume, or perform maneuvers on a PR mission.',
  },
  schematic: {
    script: 'fleet.ts',
    description: 'Manage infrastructure blueprints: <list|create|edit|import>',
  },
  station: {
    script: 'fleet.ts',
    description: 'Hardware control: <activate|list|liftoff|delete>',
  },

  liftoff: {
    script: 'setup.ts',
    description: 'Build or wake infrastructure (use --with-station).',
  },
  ci: {
    script: 'ci.ts',
    description: 'Monitor CI status for a branch with noise filtering.',
  },
  pulse: {
    script: 'status.ts',
    description: 'Check station health and active mission status.',
  },
  uplink: {
    script: 'uplink.ts',
    description: 'Quickly connect to an existing mission session.',
  },
  splashdown: {
    script: 'splashdown.ts',
    description: 'Emergency shutdown of all active remote capsules.',
  },
  jettison: {
    script: 'jettison.ts',
    description: 'Decommission a specific mission and its worktree.',
  },
  reap: {
    script: 'reap.ts',
    description: 'Cleanup idle mission capsules based on inactivity.',
  },
  blackbox: {
    script: 'blackbox.ts',
    description: 'Retrieve detailed mission telemetry and history logs.',
  },
  'install-shell': {
    script: 'install-shell.ts',
    description: 'Install Orbit shell aliases and tab-completion.',
  },
  install_shell: {
    script: 'install-shell.ts',
    description: 'Install Orbit shell aliases and tab-completion.',
  },
};

function showHelp() {
  console.log('\n🚀 GEMINI ORBIT - Command Line Interface\n');
  console.log('Usage: orbit <command> [args]\n');
  console.log('Main Commands:');
  console.log(
    '  mission   - Start, resume, or perform maneuvers on a PR mission.',
  );
  console.log('  schematic - Manage blueprints: <list|create|edit|import>');
  console.log('  station   - Manage hardware: <activate|list|liftoff|delete>');
  console.log('  pulse     - Check station health and active mission status.');
  console.log('  ci        - Monitor CI status for a branch.');
  console.log('  uplink    - Quickly connect to an existing mission session.');
  console.log(
    '  splashdown- Emergency shutdown of all active remote capsules.',
  );
  console.log(
    '  jettison  - Decommission a specific mission and its worktree.',
  );
  console.log(
    '  reap      - Cleanup idle mission capsules based on inactivity.',
  );
  console.log(
    '  blackbox  - Retrieve detailed mission telemetry and history logs.',
  );
  console.log('  install-shell - Install shell aliases and tab-completion.');

  console.log('\nFlags:');
  console.log('  -h, --help        Show this help menu');
  console.log('  -l, --local       Force local worktree mode');
  console.log('  --for-station <s> Target a specific station');
  console.log('  --schematic <s>   Use a specific schematic for liftoff');
  console.log('\nExample:');
  console.log('  orbit mission 123 review');
  console.log('  orbit station activate my-sandbox');
  console.log('');
}

const args = process.argv.slice(2);
let cmd = args[0];

// Handle universal repo:cmd shorthand (e.g., orbit dotfiles:pulse)
if (cmd && cmd.includes(':')) {
  const [repo, actualCmd] = cmd.split(':');
  process.env.GCLI_ORBIT_REPO_NAME = repo;
  cmd = actualCmd;
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

const finalCommandInfo = COMMANDS[cmd];
if (!finalCommandInfo) {
  showHelp();
  process.exit(1);
}

const scriptName = finalCommandInfo.script;
const bundleBinPath = path.join(
  ROOT,
  'bundle/bin',
  scriptName.replace('.ts', '.js'),
);
const scriptPath = path.join(ROOT, 'scripts/bin', scriptName);

let finalPath = bundleBinPath;
let useTsx = false;

// Priority: bundle/bin/ (prod) > scripts/bin/ (dev)
if (!fs.existsSync(bundleBinPath)) {
  if (fs.existsSync(scriptPath)) {
    finalPath = scriptPath;
    useTsx = true;
  } else {
    console.error(
      `\n❌ Script execution failure: Could not find ${scriptName} in bundle/bin/ or scripts/bin/`,
    );
    process.exit(1);
  }
}

const exec = useTsx ? 'npx tsx' : 'node';

// We need to pass the FULL args to the underlying script so it knows its command context
// (e.g., 'schematic' or 'station' for fleet.ts)
const finalArgs = [...args];

// Process flags that should be converted to environment variables
const rawArgs = args.slice(1);
for (let i = 0; i < rawArgs.length; i++) {
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
    const val = arg.includes('=') ? arg.split('=')[1] : rawArgs[i + 1];
    process.env.GCLI_ORBIT_INSTANCE_NAME = val;
    if (!arg.includes('=')) i++;
  } else if (
    arg.startsWith('--schematic=') ||
    (arg === '--schematic' && rawArgs[i + 1])
  ) {
    const val = arg.includes('=') ? arg.split('=')[1] : rawArgs[i + 1];
    process.env.GCLI_ORBIT_SCHEMATIC = val;
    if (!arg.includes('=')) i++;
  }
}

// Ensure shim knows it is a command to bypass interactive UI
process.env.GCLI_ORBIT_SHIM = '1';

import { spawnSync } from 'node:child_process';
const finalRes = spawnSync(exec, [finalPath, ...finalArgs], {
  stdio: 'inherit',
  shell: true,
});

process.exit(finalRes.status ?? 0);

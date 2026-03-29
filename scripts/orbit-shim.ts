/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const COMMANDS: Record<string, { script: string; description: string }> = {
  mission: {
    script: 'orchestrator.ts',
    description: 'Start, resume, or perform maneuvers on a PR mission.',
  },
  liftoff: {
    script: 'setup.ts',
    description: 'Initial station setup: provision GCE Worker and Docker base.',
  },
  ci: {
    script: 'utils/ci.mjs',
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
  constellation: {
    script: 'fleet.ts',
    description: 'Manage and coordinate multiple Orbit stations.',
  },
  blackbox: {
    script: 'blackbox.ts',
    description: 'Retrieve detailed mission telemetry and history logs.',
  },
};

function showHelp() {
  console.log('\n🚀 GEMINI ORBIT - Command Line Interface\n');
  console.log('Usage: orbit <command> [args]\n');
  console.log('Available Commands:');

  const maxLen = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
  for (const [name, info] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(maxLen + 2)} ${info.description}`);
  }

  console.log('\nFlags:');
  console.log('  -h, --help    Show this help menu');
  console.log('  -l, --local   Force local worktree mode');
  console.log('  --profile <p> Use a specific Orbit profile');
  console.log('\nExample:');
  console.log('  orbit mission 123 --review');
  console.log('  gm 123 review --local');
  console.log('');
}

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === '-h' || cmd === '--help') {
  showHelp();
  process.exit(0);
}

const commandInfo = COMMANDS[cmd];
if (!commandInfo) {
  console.error(`\n❌ Unknown command: ${cmd}`);
  showHelp();
  process.exit(1);
}

const script = commandInfo.script;
const bundleBinPath = path.join(
  ROOT,
  'bundle/bin',
  script.replace('.ts', '.js'),
);
const scriptPath = path.join(ROOT, 'scripts/bin', script);

let finalPath = bundleBinPath;
let useTsx = false;

// Priority: bundle/bin/ (prod) > scripts/bin/ (dev)
if (!fs.existsSync(bundleBinPath)) {
  if (fs.existsSync(scriptPath)) {
    finalPath = scriptPath;
    useTsx = script.endsWith('.ts');
  } else {
    // Fallback to old structure if bin is missing
    const oldBundlePath = path.join(
      ROOT,
      'bundle',
      script.replace('.ts', '.js'),
    );
    const oldScriptPath = path.join(ROOT, 'scripts', script);

    if (fs.existsSync(oldBundlePath)) {
      finalPath = oldBundlePath;
    } else if (fs.existsSync(oldScriptPath)) {
      finalPath = oldScriptPath;
      useTsx = true;
    } else {
      console.error(
        `\n❌ Script execution failure: Could not find ${script} in bundle/ or scripts/`,
      );
      process.exit(1);
    }
  }
}

const exec = useTsx ? 'npx tsx' : 'node';

// Process flags that should be converted to environment variables
const rawArgs = args.slice(1);
const filteredArgs: string[] = [];
for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === undefined) continue;
  if (arg === '--local' || arg === '-l') {
    process.env.GCLI_ORBIT_PROVIDER = 'local-worktree';
    process.env.GCLI_MCP = '0';
  } else if (arg === '--profile' && rawArgs[i + 1]) {
    process.env.GCLI_ORBIT_PROFILE = rawArgs[i + 1];
    i++;
  } else {
    filteredArgs.push(arg);
  }
}

const res = spawnSync(exec, [finalPath, ...filteredArgs], {
  stdio: 'inherit',
  env: process.env,
  shell: useTsx, // Need shell for npx
});

process.exit(res.status ?? 0);

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
    mission: { script: 'orchestrator.ts', description: 'Start, resume, or perform maneuvers on a PR mission.' },
    liftoff: { script: 'setup.ts', description: 'Initial station setup: provision GCE Worker and Docker base.' },
    ci: { script: 'utils/ci.mjs', description: 'Monitor CI status for a branch with noise filtering.' },
    pulse: { script: 'status.ts', description: 'Check station health and active mission status.' },
    uplink: { script: 'uplink.ts', description: 'Quickly connect to an existing mission session.' },
    splashdown: { script: 'splashdown.ts', description: 'Emergency shutdown of all active remote capsules.' },
    jettison: { script: 'jettison.ts', description: 'Decommission a specific mission and its worktree.' },
    constellation: { script: 'fleet.ts', description: 'Manage and coordinate multiple Orbit stations.' },
    blackbox: { script: 'blackbox.ts', description: 'Retrieve detailed mission telemetry and history logs.' }
};

function showHelp() {
    console.log('\n🚀 GEMINI ORBIT - Command Line Interface\n');
    console.log('Usage: orbit <command> [args]\n');
    console.log('Available Commands:');
    
    const maxLen = Math.max(...Object.keys(COMMANDS).map(k => k.length));
    for (const [name, info] of Object.entries(COMMANDS)) {
        console.log(`  ${name.padEnd(maxLen + 2)} ${info.description}`);
    }
    
    console.log('\nFlags:');
    console.log('  -h, --help    Show this help menu');
    console.log('\nExample:');
    console.log('  orbit mission 123 --review');
    console.log('  orbit ci feat/my-branch');
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
const bundlePath = path.join(ROOT, 'bundle', script.replace('.ts', '.js'));
const scriptPath = path.join(ROOT, 'scripts', script);

let finalPath = bundlePath;
let useTsx = false;

// Priority: bundle/ (prod) > scripts/ (dev)
if (!fs.existsSync(bundlePath)) {
    if (fs.existsSync(scriptPath)) {
        finalPath = scriptPath;
        useTsx = script.endsWith('.ts');
    } else {
        console.error(`\n❌ Script execution failure: Could not find ${script} in bundle/ or scripts/`);
        process.exit(1);
    }
}

// Forward all remaining arguments
const forwardArgs = args.slice(1);
const exec = useTsx ? 'tsx' : 'node';

// We use spawnSync to keep the process interactive and wait for completion
const res = spawnSync(exec, [finalPath, ...forwardArgs], { stdio: 'inherit' });
process.exit(res.status ?? 0);

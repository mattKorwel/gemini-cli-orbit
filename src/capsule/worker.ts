/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Universal Orbit Station (Remote)
 *
 * Multi-command orchestrator for remote development.
 */

import { runReviewPlaybook } from '../playbooks/review.js';
import { runFixPlaybook } from '../playbooks/fix.js';
import { runReadyPlaybook } from '../playbooks/ready.js';
import { SessionManager } from '../utils/SessionManager.js';
import { TempManager } from '../utils/TempManager.js';
import { getRepoConfig } from '../core/ConfigManager.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * COMMAND: init
 * Performs Git initialization, remote setup, and branch checkout.
 */
async function init(
  targetDir: string,
  upstreamUrl: string,
  branch: string,
  mirrorPath?: string,
) {
  if (fs.existsSync(path.join(targetDir, '.git'))) {
    console.log(`✅ Git workspace already initialized at ${targetDir}`);
    try {
      const res = spawnSync('git', ['checkout', branch], { cwd: targetDir });
      if (res.status !== 0) {
        console.log(`   - Branch ${branch} not found locally, fetching...`);
        spawnSync('git', ['fetch', 'origin', branch], { cwd: targetDir });
        spawnSync('git', ['checkout', branch], { cwd: targetDir });
      }
    } catch {}
    return 0;
  }

  console.log(`📦 Initializing Git workspace at ${targetDir}...`);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const runGit = (args: string[]) => {
    const res = spawnSync('git', args, {
      cwd: targetDir,
      stdio: 'inherit',
    });
    if (res.status !== 0) {
      throw new Error(`Git command failed: git ${args.join(' ')}`);
    }
  };

  runGit(['init']);
  runGit(['remote', 'add', 'origin', upstreamUrl]);

  if (mirrorPath && fs.existsSync(path.join(mirrorPath, 'config'))) {
    console.log(`   - Using reference mirror: ${mirrorPath}`);
    const alternatesPath = path.join(targetDir, '.git/objects/info/alternates');
    const mirrorObjects = path.join(mirrorPath, 'objects');
    fs.mkdirSync(path.dirname(alternatesPath), { recursive: true });
    fs.writeFileSync(alternatesPath, mirrorObjects);
  }

  const fetchArgs = ['fetch', '--depth=1', 'origin', branch];
  runGit(fetchArgs);
  runGit(['checkout', branch]);
  console.log(`✅ Workspace ready on branch: ${branch}`);
  return 0;
}

/**
 * COMMAND: run
 * Executes a mission playbook.
 */
async function run(
  prNumberOrIssue: string,
  branchName: string,
  action: string,
  policyPath: string,
) {
  const targetDir = process.cwd();

  // Resolve absolute path of gemini
  let geminiBin = '/Users/mattkorwel/.gcli/nightly/node_modules/.bin/gemini';
  if (!fs.existsSync(geminiBin)) {
    try {
      const whichRes = spawnSync('which', ['gemini'], { encoding: 'utf8' });
      if (whichRes.status === 0 && whichRes.stdout.trim()) {
        geminiBin = whichRes.stdout.trim();
      } else {
        geminiBin = 'gemini';
      }
    } catch {
      geminiBin = 'gemini';
    }
  }

  const config = getRepoConfig();
  const tempManager = new TempManager(config);
  const sessionId =
    SessionManager.getSessionIdFromEnv() ||
    SessionManager.generateMissionId(prNumberOrIssue, action);
  const logDir = tempManager.getDir(sessionId);

  // Policy Resolution
  let resolvedPolicyPath = policyPath;
  const projectLocalPolicy = path.join(
    targetDir,
    `.gemini/orbit/${action}.policy.toml`,
  );
  if (fs.existsSync(projectLocalPolicy)) {
    resolvedPolicyPath = projectLocalPolicy;
  }

  const missionHeader = `🚀 Orbit Mission | ID: ${prNumberOrIssue} | Action: ${action}`;
  console.log(`\n${missionHeader}`);
  console.log(`📂 Log Directory: ${logDir}`);
  console.log(`🛡️  Using Policy: ${resolvedPolicyPath}`);

  // Dispatch to Playbook
  switch (action) {
    case 'review':
      return runReviewPlaybook(
        prNumberOrIssue,
        targetDir,
        resolvedPolicyPath,
        geminiBin,
        logDir,
        missionHeader,
      );

    case 'fix':
      return runFixPlaybook(
        prNumberOrIssue,
        targetDir,
        resolvedPolicyPath,
        geminiBin,
        logDir,
        missionHeader,
      );

    case 'ready':
      return runReadyPlaybook(
        prNumberOrIssue,
        targetDir,
        resolvedPolicyPath,
        geminiBin,
        logDir,
        missionHeader,
      );

    case 'implement': {
      const { runImplementPlaybook } =
        await import('../playbooks/implement.js');
      return runImplementPlaybook(
        prNumberOrIssue,
        targetDir,
        resolvedPolicyPath,
        geminiBin,
        logDir,
        missionHeader,
      );
    }
    case 'chat':
      console.log('💬 Session setup complete. Re-attach to tmux to begin.');
      return 0;

    default:
      console.error(`❌ Unknown action: ${action}`);
      return 1;
  }
}

/**
 * Main entry point for the worker.
 */
export async function main(args: string[]) {
  const command = args[0];

  if (command === 'init') {
    // args: [init, identifier, branch, upstreamUrl, mirrorPath]
    const identifier = args[1];
    const branch = args[2];
    const upstreamUrl = args[3];
    const mirrorPath = args[4];

    if (!identifier || !branch || !upstreamUrl) {
      console.error('Usage: init <id> <branch> <url> [mirror]');
      return 1;
    }
    return init(process.cwd(), upstreamUrl, branch, mirrorPath);
  }

  if (command === 'run') {
    // args: [run, identifier, branch, action, policyPath]
    const identifier = args[1];
    const branch = args[2];
    const action = args[3];
    const policyPath = args[4];

    if (!identifier || !policyPath) {
      console.error('Usage: run <id> <branch> <action> <policy>');
      return 1;
    }
    return run(identifier, branch || '', action || 'chat', policyPath);
  }

  console.error('Invalid worker command. Use "init" or "run".');
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code || 0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

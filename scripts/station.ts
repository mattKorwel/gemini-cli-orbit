/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Universal Orbit Station (Remote)
 * 
 * Stateful orchestrator for complex development loops.
 */

import { runReviewPlaybook } from './playbooks/review.js';
import { runFixPlaybook } from './playbooks/fix.js';
import { runReadyPlaybook } from './playbooks/ready.js';
import { SessionManager } from './utils/SessionManager.js';
import { TempManager } from './utils/TempManager.js';
import { getRepoConfig } from './ConfigManager.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export async function runStation(args: string[]) {
  const prNumberOrIssue = args[0];
  const _branchName = args[1]; // Unused now as we assume CWD is the worktree
  const policyPath = args[2];
  const action = args[3] || 'review';

  if (!prNumberOrIssue || !policyPath) {
    console.error('Usage: tsx station.ts <ID> <BRANCH_NAME> <POLICY_PATH> [action]');
    return 1;
  }

  const targetDir = process.cwd();
  
  // Resolve absolute path of gemini to ensure we use the same one in sub-tasks
  // Prefer the nightly binary which is known to support policies
  let geminiBin = '/Users/mattkorwel/.gcli/nightly/node_modules/.bin/gemini';
  if (!fs.existsSync(geminiBin)) {
    try {
      const whichRes = spawnSync('which', ['gemini'], { encoding: 'utf8' });
      if (whichRes.status === 0 && whichRes.stdout.trim()) {
        geminiBin = whichRes.stdout.trim();
      } else {
        geminiBin = 'gemini'; // Final fallback
      }
    } catch {
      geminiBin = 'gemini';
    }
  }

  // 1. Resolve Session and Temp Directory
  const config = getRepoConfig();
  const tempManager = new TempManager(config);
  const sessionId = SessionManager.getSessionIdFromEnv() || SessionManager.generateSessionId(prNumberOrIssue, action);
  const logDir = tempManager.getDir(sessionId);

  // 2. Resolve Policy (CLI > Project Local > Fallback)
  let resolvedPolicyPath = policyPath;
  const projectLocalPolicy = path.join(targetDir, `.gemini/orbit/${action}.policy.toml`);
  if (fs.existsSync(projectLocalPolicy)) {
    resolvedPolicyPath = projectLocalPolicy;
  } else if (!fs.existsSync(resolvedPolicyPath)) {
    // Attempt fallback to a known location if the passed one doesn't exist
    const fallbackPolicy = path.join(targetDir, '.gemini/policies/workspace-policy.toml');
    if (fs.existsSync(fallbackPolicy)) {
       resolvedPolicyPath = fallbackPolicy;
    }
  }

  // 3. Resolve Guidelines (Project Local > Standard)
  const projectGuidelines = path.join(targetDir, `.gemini/orbit/${action}-guidelines.md`);
  let guidelinesPath = '';
  if (fs.existsSync(projectGuidelines)) {
    guidelinesPath = projectGuidelines;
  }

  const missionHeader = `🚀 Orbit Mission | ID: ${prNumberOrIssue} | Session: ${sessionId}`;
  console.log(`\n${missionHeader}`);
  console.log(`📂 Log Directory: ${logDir}`);
  console.log(`🛡️  Using Policy: ${resolvedPolicyPath}`);
  if (guidelinesPath) console.log(`📖 Using Guidelines: ${guidelinesPath}`);

  // 4. Update Current Session Pointer
  try {
    fs.writeFileSync(
      path.join(targetDir, '.gemini/current-session.json'),
      JSON.stringify({ sessionId, logDir, action, timestamp: new Date().toISOString() }, null, 2)
    );
  } catch {}

  // Dispatch to Playbook
  switch (action) {
    case 'review':
      return runReviewPlaybook(prNumberOrIssue, targetDir, resolvedPolicyPath, geminiBin, logDir, missionHeader, guidelinesPath);

    case 'fix':
      return runFixPlaybook(prNumberOrIssue, targetDir, resolvedPolicyPath, geminiBin, logDir, missionHeader);

    case 'ready':
      return runReadyPlaybook(prNumberOrIssue, targetDir, resolvedPolicyPath, geminiBin, logDir, missionHeader);

    case 'implement': {
      const { runImplementPlaybook } = await import('./playbooks/implement.js');
      return runImplementPlaybook(prNumberOrIssue, targetDir, resolvedPolicyPath, geminiBin, logDir, missionHeader, guidelinesPath);
    }
    case 'open':
      console.log(`🚀 Dropping into manual session...`);
      return 0;
      
    default:
      console.error(`❌ Unknown action: ${action}`);
      return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStation(process.argv.slice(2)).then(code => process.exit(code || 0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

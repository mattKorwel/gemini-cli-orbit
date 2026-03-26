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
import { spawnSync } from 'child_process';
import { runReviewPlaybook } from './playbooks/review.ts';
import { runFixPlaybook } from './playbooks/fix.ts';
import { runReadyPlaybook } from './playbooks/ready.ts';

export async function runStation(args: string[]) {
  const prNumberOrIssue = args[0];
  const branchName = args[1]; // Unused now as we assume CWD is the worktree
  const policyPath = args[2];
  const action = args[3] || 'review';

  if (!prNumberOrIssue || !policyPath) {
    console.error('Usage: tsx station.ts <ID> <BRANCH_NAME> <POLICY_PATH> [action]');
    return 1;
  }

  const targetDir = process.cwd();
  
  // Use global gemini command pre-installed in the development image
  const geminiBin = 'gemini';

  // Dispatch to Playbook
  switch (action) {
    case 'review':
      return runReviewPlaybook(prNumberOrIssue, targetDir, policyPath, geminiBin);
    
    case 'fix':
      return runFixPlaybook(prNumberOrIssue, targetDir, policyPath, geminiBin);
    
    case 'ready':
      return runReadyPlaybook(prNumberOrIssue, targetDir, policyPath, geminiBin);
    
    case 'implement': {
      const { runImplementPlaybook } = await import('./playbooks/implement.ts');
      return runImplementPlaybook(prNumberOrIssue, targetDir, policyPath, geminiBin);
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
  runStation(process.argv.slice(2)).catch(console.error);
}

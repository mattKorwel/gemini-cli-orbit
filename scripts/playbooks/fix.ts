import { spawnSync } from 'child_process';


export async function runFixPlaybook(prNumber: string, targetDir: string, policyPath: string, geminiBin: string) {
  console.log(`🚀 Orbit | FIX | PR #${prNumber}`);
  console.log('Switching to agentic fix loop inside Gemini CLI...');

  // Use the nightly gemini binary to activate the fix-pr skill and iterate
  // Note: Gemini doesn't support --cwd, so the caller (worker.ts) must ensure we are already in targetDir
  const result = spawnSync(geminiBin, [
    '--policy', policyPath,
    '-p', `I'm in a remote orbit to fix PR #${prNumber}. 
           Please help me resolve merge conflicts, fix failing tests, and address any open review comments.
           You have full access to the codebase and common development tools.`
  ], { stdio: 'inherit' });

  return result?.status ?? 1;
}

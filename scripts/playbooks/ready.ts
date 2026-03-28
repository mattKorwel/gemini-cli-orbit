import { createTaskRunner } from '../TaskRunner.js';
import path from 'path';

export async function runReadyPlaybook(prNumber: string, targetDir: string, _policyPath: string, _geminiBin: string) {
  const runner = createTaskRunner(
    path.join(targetDir, `.gemini/logs/orbit-${prNumber}`),
    `🚀 Orbit | READY | PR #${prNumber}`
  );

  runner.register([
    { id: 'clean', name: 'Clean Orbit', cmd: `npm run clean && npm ci` },
    { id: 'preflight', name: 'Full Preflight', cmd: `npm run preflight`, dep: 'clean' },
    { id: 'conflicts', name: 'Main Conflict Check', cmd: `git fetch origin main && git merge-base --is-ancestor origin/main HEAD` }
  ]);

  const status = await runner.runAll();
  return status;
}

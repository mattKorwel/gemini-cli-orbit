import { createTaskRunner } from '../core/TaskRunner.js';
import { type IProcessManager } from '../core/interfaces.js';

export async function runReadyPlaybook(
  prNumber: string,
  targetDir: string,
  _policyPath: string,
  _geminiBin: string,
  logDir: string,
  missionHeader: string,
  pm?: IProcessManager,
) {
  const runner = createTaskRunner(logDir, missionHeader, pm);

  runner.register([
    { id: 'clean', name: 'Clean Orbit', cmd: `npm run clean && npm ci` },
    {
      id: 'preflight',
      name: 'Full Preflight',
      cmd: `npm run preflight`,
      dep: 'clean',
    },
    {
      id: 'conflicts',
      name: 'Main Conflict Check',
      cmd: `git fetch origin main && git merge-base --is-ancestor origin/main HEAD`,
    },
  ]);

  const status = await runner.runAll();
  return status;
}

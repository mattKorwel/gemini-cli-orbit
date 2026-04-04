import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-test-'));
const remoteRepoPath = path.join(tmpDir, 'remote-repo');

fs.mkdirSync(remoteRepoPath, { recursive: true });

const run = (cmd: string, args: string[], cwd: string) => {
  const res = spawnSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
  console.log(`> ${cmd} ${args.join(' ')} (in ${cwd})`);
  if (res.status !== 0) {
    console.log(`  ERROR: ${res.stderr}`);
  }
  return res;
};

run('git', ['init'], remoteRepoPath);
fs.writeFileSync(path.join(remoteRepoPath, 'README.md'), '# Test Repo');
run('git', ['add', '.'], remoteRepoPath);
run('git', ['commit', '-m', 'initial commit'], remoteRepoPath);
run('git', ['checkout', '-b', 'feat/test'], remoteRepoPath);

function runTest(name: string, fetchArgs: string[]) {
  console.log(`--- ${name} ---`);
  const workspacePath = path.join(
    tmpDir,
    `workspace-${name.replace(/\s+/g, '-')}`,
  );
  fs.mkdirSync(workspacePath, { recursive: true });
  run('git', ['init'], workspacePath);
  run('git', ['remote', 'add', 'origin', remoteRepoPath], workspacePath);
  const res = run(
    'git',
    ['fetch', '--depth=1', 'origin', ...fetchArgs],
    workspacePath,
  );
  if (res.status === 0) {
    run('git', ['checkout', 'feat/test'], workspacePath);
  }
}

runTest('explicit-refspec', ['refs/heads/feat/test:refs/heads/feat/test']);
runTest('simple-branch', ['feat/test']);

fs.rmSync(tmpDir, { recursive: true, force: true });

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from '../core/Logger.js';
import { StarfleetHarness } from '../test/StarfleetHarness.js';
import { normalizeBehaviorHistory } from '../test/BehaviorSnapshot.js';

let activeBinDir = '';

vi.mock('../core/ProcessManager.js', async () => {
  const actual = await vi.importActual<
    typeof import('../core/ProcessManager.js')
  >('../core/ProcessManager.js');
  const testActual = await vi.importActual<
    typeof import('../test/TestProcessManager.js')
  >('../test/TestProcessManager.js');

  class BehaviorProcessManager extends testActual.TestProcessManager {
    constructor(defaultOptions: any = {}, useSudo = false) {
      super(new actual.ProcessManager(defaultOptions, useSudo), {
        binDir: activeBinDir,
      });
    }

    static runSync(bin: string, args: string[], options: any = {}) {
      return new BehaviorProcessManager().runSync(bin, args, options);
    }

    static runAsync(bin: string, args: string[], options: any = {}) {
      return new BehaviorProcessManager().runAsync(bin, args, options);
    }
  }

  return {
    ...actual,
    ProcessManager: BehaviorProcessManager,
  };
});

describe('Local Worktree Behavior', () => {
  let harness: StarfleetHarness;
  let originalCwd: string;

  beforeEach(() => {
    harness = new StarfleetHarness('LocalWorktree');
    const home = harness.resolve('home');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    activeBinDir = harness.bin;
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    logger.setRepoRoot(originalCwd);
    await new Promise((resolve) => setTimeout(resolve, 100));
    activeBinDir = '';
    vi.resetModules();
    vi.unstubAllEnvs();
    harness.cleanup();
  });

  it(
    'launches a local worktree mission with an external manifest and tmux session',
    { timeout: 15000 },
    async () => {
      const repoRoot = harness.resolve('repo');
      const home = os.homedir();
      const appData = path.join(home, 'AppData', 'Roaming');
      const worktreeRoot = path.resolve(repoRoot, '..', 'orbit-git-worktrees');
      const workspacePath = path.join(worktreeRoot, 'test-repo', 'local-123');
      fs.mkdirSync(path.join(repoRoot, '.gemini', 'policies'), {
        recursive: true,
      });
      fs.mkdirSync(path.join(repoRoot, 'bundle'), { recursive: true });
      fs.mkdirSync(appData, { recursive: true });
      fs.writeFileSync(
        path.join(repoRoot, '.gemini', 'policies', 'workspace-policy.toml'),
        '',
      );

      harness.stubScript(
        'git',
        `
const joined = args.join(' ');

if (joined === 'remote get-url origin') {
  process.stdout.write('https://github.com/org/test-repo.git\\n');
  process.exit(0);
}

if (joined === 'rev-parse --show-toplevel') {
  process.stdout.write(${JSON.stringify(repoRoot)} + '\\n');
  process.exit(0);
}

if (joined === '-C ${repoRoot} fetch origin local-123') {
  process.exit(0);
}

if (joined.includes('show-ref --verify')) {
  process.exit(1);
}

const worktreeIndex = args.indexOf('worktree');
if (worktreeIndex >= 0 && args[worktreeIndex + 1] === 'add') {
  const targetPath = args.find((arg) => arg.includes('orbit-git-worktrees'));
  if (!targetPath) {
    process.exit(1);
  }
  fs.mkdirSync(targetPath, { recursive: true });
  process.exit(0);
}

process.exit(0);
`,
      );

      const tmuxStub = `
if (args[0] === '-V') {
  process.stdout.write('tmux 3.4\\n');
  process.exit(0);
}

if (args[0] === 'new-session') {
  process.exit(0);
}

if (args[0] === 'attach-session') {
  process.exit(0);
}

process.exit(0);
`;

      harness.stubScript('tmux', tmuxStub);

      vi.stubEnv('HOME', home);
      vi.stubEnv('USERPROFILE', home);
      vi.stubEnv('APPDATA', appData);
      vi.stubEnv('GCLI_ORBIT_REPO_NAME', 'test-repo');
      vi.stubEnv('ORBIT_GIT_BIN', 'git');
      vi.stubEnv('ORBIT_TMUX_BIN', 'tmux');

      const { dispatch } = await import('./cli.js');
      const { getLocalMissionManifestPath } =
        await import('../core/Constants.js');
      const exitCode = await dispatch([
        '--repo-dir',
        repoRoot,
        'mission',
        'launch',
        'local-123',
        'chat',
        '--local',
        '--git-auth',
        'none',
        '--gemini-auth',
        'none',
      ]);

      const normalizedHistory = normalizeBehaviorHistory(harness.getHistory(), {
        placeholders: {
          [repoRoot]: '<tmp>/repo',
          [worktreeRoot]: '<tmp>/worktrees',
          [home]: '<tmp>/home',
          [harness.bin]: '<bin>',
        },
      });
      const manifestPath = getLocalMissionManifestPath('test-repo/local-123');
      const sessionPattern = /test-repo(?:\/|-)local-123/;

      expect(exitCode).toBe(0);
      expect(fs.existsSync(workspacePath)).toBe(true);
      expect(fs.existsSync(manifestPath)).toBe(true);
      expect(
        fs.existsSync(path.join(workspacePath, '.orbit-manifest.json')),
      ).toBe(false);
      expect(
        normalizedHistory.some(
          (line) =>
            /tmux new-session -A -s /.test(line) && sessionPattern.test(line),
        ),
      ).toBe(true);
      expect(
        normalizedHistory.some(
          (line) =>
            /tmux new-session -d -A -s /.test(line) &&
            sessionPattern.test(line),
        ),
      ).toBe(false);
      expect(
        normalizedHistory.some(
          (line) =>
            /tmux attach-session -t /.test(line) && sessionPattern.test(line),
        ),
      ).toBe(false);
    },
  );
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const hoisted = vi.hoisted(() => {
  const timestamp = Date.now();
  const tmpDir = process.env.TMPDIR || '/tmp';
  const sandbox = `${tmpDir}/orbit-e2e-sandbox-${timestamp}`;
  return {
    sandboxDir: sandbox,
    mainRepoDir: `${sandbox}/main`,
  };
});

vi.mock('../core/Constants.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getPrimaryRepoRoot: () => hoisted.mainRepoDir,
  };
});

describe('LocalWorktreeProvider E2E', () => {
  const { sandboxDir, mainRepoDir } = hoisted;
  const worktreesDir = sandboxDir;

  beforeAll(() => {
    // Setup Sandbox
    if (fs.existsSync(sandboxDir)) {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
    fs.mkdirSync(sandboxDir, { recursive: true });

    // Initialize Main Repo
    execSync(`git init ${mainRepoDir}`);
    execSync(`git -C ${mainRepoDir} config user.email "test@example.com"`);
    execSync(`git -C ${mainRepoDir} config user.name "Test User"`);
    fs.writeFileSync(path.join(mainRepoDir, 'README.md'), 'initial content');
    execSync(`git -C ${mainRepoDir} add .`);
    execSync(`git -C ${mainRepoDir} commit -m "initial commit"`);
    execSync(`git -C ${mainRepoDir} branch -M main`);
    execSync(`git -C ${mainRepoDir} branch feat-test-1`);
  });

  afterAll(() => {
    // Cleanup Sandbox
    if (fs.existsSync(sandboxDir)) {
      try {
        const wtListRes = spawnSync(
          'git',
          ['-C', mainRepoDir, 'worktree', 'list', '--porcelain'],
          { encoding: 'utf8' },
        );
        if (wtListRes.stdout) {
          const wtPaths = wtListRes.stdout
            .split('\n')
            .filter((l) => l.startsWith('worktree '))
            .map((l) => l.substring(9).trim());
          wtPaths.forEach((p) => {
            if (p && p !== mainRepoDir && fs.existsSync(p)) {
              execSync(`git -C ${mainRepoDir} worktree remove ${p} --force`);
            }
          });
        }
      } catch (_e) {}
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  it('should perform full lifecycle: provision -> status -> remove', async () => {
    const { LocalWorktreeProvider } =
      await import('./LocalWorktreeProvider.js');
    type ProjectContext = import('../core/Constants.js').ProjectContext;

    const projectCtx: ProjectContext = {
      repoRoot: mainRepoDir,
      repoName: 'test-repo',
    };

    const provider = new LocalWorktreeProvider(
      projectCtx,
      'e2e-station',
      worktreesDir,
    );
    const identifier = '123';
    const branchName = 'feat-test-1';
    const targetWtPath = path.join(worktreesDir, `orbit-${identifier}`);

    // 1. Provision (Run Capsule)
    await provider.prepareMissionWorkspace(identifier, branchName, 'chat', {
      projectId: 'local',
    } as any);

    expect(fs.existsSync(targetWtPath)).toBe(true);

    // 2. Status
    const capsules = await provider.listCapsules();
    expect(capsules).toContain(`orbit-${identifier}`);
    expect(capsules).not.toContain('main');

    // 3. Remove
    const removeRes = await provider.removeCapsule(`orbit-${identifier}`);
    expect(removeRes).toBe(0);
    expect(fs.existsSync(targetWtPath)).toBe(false);

    const finalCapsules = await provider.listCapsules();
    expect(finalCapsules).not.toContain(`orbit-${identifier}`);
  });
});

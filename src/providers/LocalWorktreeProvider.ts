/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {
  type OrbitProvider,
  type ExecOptions,
  type OrbitStatus,
} from './BaseProvider.js';
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';
import {
  getPrimaryRepoRoot,
  type ProjectContext,
  type InfrastructureSpec,
} from '../core/Constants.js';

const MISSION_PREFIX = 'orbit-';

/**
 * LocalWorktreeProvider: High-performance local workspace management.
 * Aligned with the user's native 'rswitch' and 'go' dotfiles workflow.
 */
export class LocalWorktreeProvider implements OrbitProvider {
  public readonly type = 'local-worktree';
  public readonly isLocal = true;
  public projectId = 'local';
  public zone = 'localhost';
  public stationName: string;
  public workspacesDir: string;

  constructor(
    private readonly projectCtx: ProjectContext,
    stationName = 'local',
    workspacesDir?: string,
  ) {
    this.stationName = stationName;
    const primaryRoot = getPrimaryRepoRoot(this.projectCtx.repoRoot);

    // Default to sibling 'workspaces' directory of main repo
    this.workspacesDir =
      workspacesDir || path.resolve(primaryRoot, '..', 'workspaces');

    if (
      this.workspacesDir === '/mnt/disks/data' ||
      this.workspacesDir === '/mnt/disks/data/workspaces'
    ) {
      // Fallback for when Constants defaults leak into local mode
      this.workspacesDir = path.resolve(primaryRoot, '..', 'workspaces');
    }

    if (
      !this.workspacesDir.startsWith('/mnt/disks/data') &&
      !fs.existsSync(this.workspacesDir)
    ) {
      fs.mkdirSync(this.workspacesDir, { recursive: true });
    }
  }

  private hasTmux(): boolean {
    const res = spawnSync('which', ['tmux'], { stdio: 'pipe' });
    return res.status === 0;
  }

  injectState(_state: InfrastructureState): void {
    // No-op for local
  }

  async ensureReady(): Promise<number> {
    return 0;
  }

  private q(val: string): string {
    return `'${val.replace(/'/g, "'\\''")}'`;
  }

  getRunCommand(command: string, options: ExecOptions = {}): string {
    const envPrefix = options.env
      ? Object.entries(options.env)
          .map(([k, v]) => `${k}=${this.q(v)}`)
          .join(' ') + ' '
      : '';

    const primaryRoot = getPrimaryRepoRoot(this.projectCtx.repoRoot);
    const capsuleDir = options.wrapCapsule
      ? this.findExistingWorktree(options.wrapCapsule, primaryRoot) ||
        path.join(this.workspacesDir, `${MISSION_PREFIX}${options.wrapCapsule}`)
      : this.projectCtx.repoRoot;

    if (this.hasTmux()) {
      const sessionName = options.wrapCapsule
        ? `orbit-${options.wrapCapsule}`
        : 'orbit-local';
      return `tmux new-session -A -s ${this.q(sessionName)} "cd ${this.q(capsuleDir)} && ${envPrefix}${command}; exec zsh"`;
    }

    console.warn(
      '\n⚠️  [LocalWorktree] tmux not found. Persistence is disabled, so closing this terminal will kill the mission.',
    );
    console.warn(
      '👉 Run "brew install tmux" to enable persistent background missions.\n',
    );
    return `cd ${this.q(capsuleDir)} && ${envPrefix}${command}`;
  }

  async exec(command: string, options: ExecOptions = {}): Promise<number> {
    const res = await this.getExecOutput(command, options);
    return res.status;
  }

  async getExecOutput(
    command: string,
    options: ExecOptions = {},
  ): Promise<{ status: number; stdout: string; stderr: string }> {
    let cwd = options.cwd || this.projectCtx.repoRoot;
    if (options.wrapCapsule) {
      const primaryRoot = getPrimaryRepoRoot(this.projectCtx.repoRoot);
      cwd =
        this.findExistingWorktree(options.wrapCapsule, primaryRoot) ||
        path.join(
          this.workspacesDir,
          `${MISSION_PREFIX}${options.wrapCapsule}`,
        );
    }

    const res = spawnSync(command, {
      stdio: options.quiet ? 'pipe' : 'inherit',
      shell: true,
      cwd,
      env: { ...process.env, ...options.env, GEMINI_AUTO_UPDATE: '0' },
    });

    return {
      status: res.status ?? (res.error ? 1 : 0),
      stdout: res.stdout?.toString() || '',
      stderr: res.stderr?.toString() || '',
    };
  }

  async sync(): Promise<number> {
    return 0;
  }

  async prepareMissionWorkspace(
    _identifier: string,
    branch: string,
    _infra: InfrastructureSpec,
  ): Promise<void> {
    const actualBranch = branch;
    const sourceDir = getPrimaryRepoRoot(this.projectCtx.repoRoot);
    const wtPath = path.join(
      this.workspacesDir,
      `${MISSION_PREFIX}${actualBranch}`,
    );

    if (fs.existsSync(wtPath)) {
      return;
    }

    console.log(
      `   🌿 Orbit: Provisioning local workspace for '${actualBranch}'...`,
    );

    // Ensure origin is up to date (ignore failures if no origin)
    spawnSync('git', ['-C', sourceDir, 'fetch', 'origin'], {
      stdio: 'ignore',
    });

    const args: string[] = ['worktree', 'add'];
    const localCheck = spawnSync('git', [
      '-C',
      sourceDir,
      'show-ref',
      '--verify',
      `refs/heads/${actualBranch}`,
    ]);

    if (localCheck.status === 0) {
      args.push(wtPath, actualBranch);
    } else {
      args.push('-b', actualBranch, wtPath, `origin/${actualBranch}`);
    }

    const res = spawnSync('git', ['-C', sourceDir, ...args], {
      stdio: 'inherit',
    });

    if (res.status !== 0) {
      throw new Error(`Failed to create workspace: exit code ${res.status}`);
    }
  }

  async getStatus(): Promise<OrbitStatus> {
    return {
      name: this.stationName,
      status: 'RUNNING',
      internalIp: '127.0.0.1',
    };
  }

  async stop(): Promise<number> {
    return 0;
  }

  async getCapsuleStatus(
    name: string,
  ): Promise<{ running: boolean; exists: boolean }> {
    const primaryRoot = getPrimaryRepoRoot(this.projectCtx.repoRoot);
    const wtCheck = this.findExistingWorktree(name, primaryRoot);
    if (wtCheck) {
      return { exists: true, running: true };
    }
    return { exists: false, running: false };
  }

  async getCapsuleStats(): Promise<string> {
    return 'N/A (Local)';
  }

  async getCapsuleIdleTime(): Promise<number> {
    return 0;
  }

  async attach(name: string): Promise<number> {
    if (!this.hasTmux()) {
      console.warn('⚠️  Tmux not found. Cannot attach to persistent session.');
      return 1;
    }
    const res = spawnSync('tmux', ['attach-session', '-t', `orbit-${name}`], {
      stdio: 'inherit',
    });
    return res.status ?? 0;
  }

  async runCapsule(): Promise<number> {
    throw new Error('runCapsule is not supported in LocalWorktreeProvider.');
  }

  async stopCapsule(name: string): Promise<number> {
    if (this.hasTmux()) {
      spawnSync('tmux', ['kill-session', '-t', `orbit-${name}`]);
    }
    return 0;
  }

  async removeCapsule(name: string): Promise<number> {
    const sourceDir = getPrimaryRepoRoot(this.projectCtx.repoRoot);
    const wtPath = this.findExistingWorktree(name, sourceDir);

    if (!wtPath) return 0;

    // PRIMARY ROOT PROTECTION: NEVER delete the primary repository
    if (path.resolve(wtPath) === path.resolve(sourceDir)) {
      console.warn(
        '⚠️  CRITICAL SAFETY: Blocked attempt to delete primary repository root.',
      );
      return 1;
    }

    console.log(
      `   🔥 Orbit: Removing local workspace: ${path.basename(wtPath)}`,
    );
    const res = spawnSync(
      'git',
      ['-C', sourceDir, 'worktree', 'remove', wtPath, '--force'],
      {
        stdio: 'inherit',
      },
    );

    if (this.hasTmux()) {
      spawnSync('tmux', ['kill-session', '-t', `orbit-${name}`]);
    }

    return res.status ?? 0;
  }

  async capturePane(): Promise<string> {
    return 'N/A (Local)';
  }

  async listStations(): Promise<number> {
    console.log('--- LOCAL WORKTREE STATION ---');
    return 0;
  }

  async destroy(): Promise<number> {
    return 0;
  }

  async provisionMirror(_remoteUrl: string): Promise<number> {
    return 0;
  }

  async stationShell(): Promise<number> {
    const res = spawnSync('zsh', { stdio: 'inherit', shell: true });
    return res.status ?? 0;
  }

  async missionShell(capsuleName: string): Promise<number> {
    // For local worktree, a "shell" is just another terminal in the same worktree.
    // We use tmux to ensure persistence if possible.
    const primaryRoot = getPrimaryRepoRoot(this.projectCtx.repoRoot);
    const wtPath =
      this.findExistingWorktree(capsuleName, primaryRoot) ||
      path.join(this.workspacesDir, `${MISSION_PREFIX}${capsuleName}`);

    const res = spawnSync('zsh', {
      stdio: 'inherit',
      shell: true,
      cwd: wtPath,
    });
    return res.status ?? 0;
  }

  async listCapsules(): Promise<string[]> {
    const primaryRoot = getPrimaryRepoRoot(this.projectCtx.repoRoot);
    const res = spawnSync(
      'git',
      ['-C', primaryRoot, 'worktree', 'list', '--porcelain'],
      {
        stdio: 'pipe',
      },
    );
    const workspaces: string[] = [];
    if (res.status === 0) {
      const output = res.stdout.toString();
      const blocks = output.split('\n\n');

      const realWorktreesDir = fs.realpathSync(this.workspacesDir);
      const realPrimaryRoot = fs.realpathSync(primaryRoot);

      for (const block of blocks) {
        const lines = block.split('\n');
        const workspaceLine = lines.find((l) => l.startsWith('worktree '));
        if (!workspaceLine) continue;

        let wtPath = workspaceLine.replace('worktree ', '').trim();
        if (!wtPath) continue;

        try {
          wtPath = fs.realpathSync(wtPath);
        } catch (_e) {
          continue;
        }

        const folderName = path.basename(wtPath);

        // SAFETY FIREWALL:
        // 1. Must be in the workspaces directory
        // 2. Must start with the MISSION_PREFIX ('orbit-')
        // 3. Must NOT be the primary repository root
        if (
          wtPath.startsWith(realWorktreesDir) &&
          folderName.startsWith(MISSION_PREFIX) &&
          wtPath !== realPrimaryRoot
        ) {
          workspaces.push(folderName);
        }
      }
    }
    return workspaces;
  }

  private findExistingWorktree(name: string, sourceDir: string): string | null {
    const res = spawnSync(
      'git',
      ['-C', sourceDir, 'worktree', 'list', '--porcelain'],
      { stdio: 'pipe' },
    );
    if (res.status !== 0) return null;

    const output = res.stdout.toString();
    const blocks = output.split('\n\n');

    for (const block of blocks) {
      const lines = block.split('\n');
      const workspaceLine = lines.find((l) => l.startsWith('worktree '));
      const branchLine = lines.find((l) => l.startsWith('branch '));

      if (workspaceLine && branchLine) {
        const wtPath = workspaceLine.replace('worktree ', '').trim();
        const branch = branchLine.replace('branch refs/heads/', '').trim();

        // Match if branch matches name AND folder has prefix (Safe)
        // Or exact path matches if name is already prefixed
        const folderName = path.basename(wtPath);
        if (branch === name && folderName.startsWith(MISSION_PREFIX))
          return wtPath;
        if (folderName === name && folderName.startsWith(MISSION_PREFIX))
          return wtPath;
      }
    }
    return null;
  }
}

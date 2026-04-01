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
  type CapsuleConfig,
} from './BaseProvider.js';
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';
import { getPrimaryRepoRoot } from '../core/Constants.js';
import { resolveMissionContext } from '../utils/MissionUtils.js';

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
  public worktreesDir: string;

  constructor(stationName = 'local', worktreesDir?: string) {
    this.stationName = stationName;
    const primaryRoot = getPrimaryRepoRoot();

    // Default to sibling 'worktrees' directory of main repo
    this.worktreesDir =
      worktreesDir || path.resolve(primaryRoot, '..', 'worktrees');

    if (this.worktreesDir === '/mnt/disks/data' || this.worktreesDir === '/mnt/disks/data/worktrees') {
      // Fallback for when Constants defaults leak into local mode
      this.worktreesDir = path.resolve(primaryRoot, '..', 'worktrees');
    }

    if (!this.worktreesDir.startsWith('/mnt/disks/data') && !fs.existsSync(this.worktreesDir)) {
      fs.mkdirSync(this.worktreesDir, { recursive: true });
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

    const capsuleDir = options.wrapCapsule
      ? this.findExistingWorktree(options.wrapCapsule, getPrimaryRepoRoot()) ||
        path.join(this.worktreesDir, options.wrapCapsule)
      : process.cwd();

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
    let cwd = options.cwd || process.cwd();
    if (options.wrapCapsule) {
      cwd =
        this.findExistingWorktree(options.wrapCapsule, getPrimaryRepoRoot()) ||
        path.join(this.worktreesDir, options.wrapCapsule);
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
    _config: any,
  ): Promise<void> {
    const mCtx = resolveMissionContext(_identifier, 'chat'); // We need the canonical branch from the ID
    const actualBranch = mCtx.branchName;
    const sourceDir = getPrimaryRepoRoot();
    const wtPath = path.join(this.worktreesDir, actualBranch);

    if (fs.existsSync(wtPath)) {
      return;
    }

    console.log(`   🌿 Orbit: Provisioning local worktree for '${actualBranch}'...`);

    // Ensure origin is up to date
    spawnSync('git', ['-C', sourceDir, 'fetch', 'origin'], {
      stdio: 'inherit',
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
      throw new Error(`Failed to create worktree: exit code ${res.status}`);
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
    const wtCheck = this.findExistingWorktree(name, getPrimaryRepoRoot());
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
    const sourceDir = getPrimaryRepoRoot();
    const wtPath = this.findExistingWorktree(name, sourceDir);
    if (!wtPath) return 0;

    console.log(`   🔥 Orbit: Removing local worktree: ${name}`);
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

  async listCapsules(): Promise<string[]> {
    const primaryRoot = getPrimaryRepoRoot();
    const res = spawnSync('git', ['-C', primaryRoot, 'worktree', 'list'], {
      stdio: 'pipe',
    });
    const worktrees: string[] = [];
    if (res.status === 0) {
      const lines = res.stdout.toString().split('\n');
      for (const line of lines) {
        const parts = line.split(' ').filter(Boolean);
        if (parts.length === 0) continue;
        const wtPath = parts[0];
        if (!wtPath) continue;

        // Only include if it's in our worktreesDir and not the primary repo itself.
        if (wtPath.startsWith(this.worktreesDir) && wtPath !== primaryRoot) {
          worktrees.push(path.basename(wtPath));
        }
      }
    }
    return worktrees;
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
      const worktreeLine = lines.find((l) => l.startsWith('worktree '));
      const branchLine = lines.find((l) => l.startsWith('branch '));

      if (worktreeLine && branchLine) {
        const wtPath = worktreeLine.replace('worktree ', '').trim();
        const branch = branchLine.replace('branch refs/heads/', '').trim();
        if (branch === name) return wtPath;
      }
    }
    return null;
  }
}

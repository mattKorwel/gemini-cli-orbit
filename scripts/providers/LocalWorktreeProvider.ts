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
import { getPrimaryRepoRoot } from '../Constants.js';

/**
 * LocalWorktreeProvider: High-performance local workspace management.
 * Aligned with the user's native 'rswitch' and 'go' dotfiles workflow.
 * Manages worktrees as siblings in ~/dev/<repo>/ and uses tmux for persistence.
 */
export class LocalWorktreeProvider implements OrbitProvider {
  public readonly type = 'local-worktree';
  public readonly isLocal = true;
  public projectId: string = 'local';
  public zone: string = 'localhost';
  public stationName: string;
  public worktreesDir: string;

  constructor(stationName: string = 'local', worktreesDir?: string) {
    this.stationName = stationName;
    // Default to parent of primary repo (e.g., ~/dev/gemini-cli-orbit/)
    // so worktrees are siblings to 'main'
    this.worktreesDir = worktreesDir || path.dirname(getPrimaryRepoRoot());

    // Safety check: Never try to mkdir /mnt/disks/data locally
    if (this.worktreesDir.startsWith('/mnt/disks/data')) {
      this.worktreesDir = path.dirname(getPrimaryRepoRoot());
    }

    if (!fs.existsSync(this.worktreesDir)) {
      fs.mkdirSync(this.worktreesDir, { recursive: true });
    }

    // Resolve absolute path to handle symlinks (like /var -> /private/var on macOS)
    try {
      this.worktreesDir = fs.realpathSync(this.worktreesDir);
    } catch (_e) {}
  }
  private hasTmux(): boolean {
    const res = spawnSync('which', ['tmux'], { stdio: 'pipe' });
    return res.status === 0;
  }

  async provision(): Promise<number> {
    return 0;
  }

  async ensureReady(): Promise<number> {
    return 0;
  }

  async setup(): Promise<number> {
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
      const tmuxCheck = this.hasTmux()
        ? spawnSync('tmux', ['has-session', '-t', `orbit-${name}`]).status === 0
        : false;
      return { exists: true, running: tmuxCheck };
    }
    return { exists: false, running: false };
  }

  async getCapsuleStats(): Promise<string> {
    return 'N/A (Local Worktree)';
  }

  async getCapsuleIdleTime(): Promise<number> {
    return 0;
  }

  async runCapsule(config: CapsuleConfig): Promise<number> {
    const branch = config.name;
    const sourceDir = config.image;

    if (!sourceDir || !fs.existsSync(path.join(sourceDir, '.git'))) {
      console.error(
        `❌ Cannot provision worktree: '${sourceDir}' is not a valid git repository.`,
      );
      return 1;
    }

    const existingWt = this.findExistingWorktree(branch, sourceDir);
    if (existingWt) {
      console.log(
        `   📍 Branch '${branch}' is already checked out at: ${existingWt}`,
      );
      return 0;
    }

    const targetDir = path.join(this.worktreesDir, branch);
    console.log(
      `   🌿 Orbit: Provisioning local worktree for '${branch}' in ${targetDir}...`,
    );

    spawnSync('git', ['-C', sourceDir, 'fetch', 'origin'], {
      stdio: 'inherit',
    });

    const args: string[] = ['worktree', 'add'];
    const localCheck = spawnSync('git', [
      '-C',
      sourceDir,
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${branch}`,
    ]);

    if (localCheck.status === 0) {
      args.push(targetDir, branch);
    } else {
      const remoteCheck = spawnSync('git', [
        '-C',
        sourceDir,
        'ls-remote',
        '--exit-code',
        '--heads',
        'origin',
        branch,
      ]);
      if (remoteCheck.status === 0) {
        args.push('-b', branch, targetDir, `origin/${branch}`);
      } else {
        args.push('-b', branch, targetDir, 'origin/main');
      }
    }

    const res = spawnSync('git', ['-C', sourceDir, ...args], {
      stdio: 'inherit',
    });
    return res.status ?? 0;
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

  async capturePane(capsuleName: string): Promise<string> {
    if (!this.hasTmux()) return '';
    const res = spawnSync(
      'tmux',
      ['capture-pane', '-pt', `orbit-${capsuleName}`],
      { stdio: 'pipe' },
    );
    return res.stdout?.toString() || '';
  }

  async listStations(): Promise<number> {
    console.log(`🏠 Local Workspace: ${this.worktreesDir}`);
    return 0;
  }

  async destroy(): Promise<number> {
    return 0;
  }

  async listCapsules(): Promise<string[]> {
    const sourceDir = getPrimaryRepoRoot();
    const res = spawnSync(
      'git',
      ['-C', sourceDir, 'worktree', 'list', '--porcelain'],
      { stdio: 'pipe' },
    );
    if (res.status !== 0) return [];

    const worktrees: string[] = [];
    const lines = res.stdout.toString().split('\n');
    const primaryRoot = fs.realpathSync(getPrimaryRepoRoot());

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        let wtPath = line.substring(9).trim();
        try {
          wtPath = fs.realpathSync(wtPath);
        } catch (_e) {}

        // Only include worktrees that are inside our designated worktreesDir
        // and are not the primary repo itself.
        if (wtPath.startsWith(this.worktreesDir) && wtPath !== primaryRoot) {
          worktrees.push(path.basename(wtPath));
        }
      }
    }
    return worktrees;
  }

  private findExistingWorktree(
    branch: string,
    sourceDir: string,
  ): string | null {
    const res = spawnSync(
      'git',
      ['-C', sourceDir, 'worktree', 'list', '--porcelain'],
      { stdio: 'pipe' },
    );
    if (res.status !== 0) return null;

    const lines = res.stdout.toString().split('\n');
    let currentPath = '';
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        currentPath = line.substring(9).trim();
        try {
          currentPath = fs.realpathSync(currentPath);
        } catch (_e) {}
      } else if (
        line.startsWith('branch refs/heads/') &&
        line.endsWith(branch)
      ) {
        return currentPath;
      }
    }
    return null;
  }
}

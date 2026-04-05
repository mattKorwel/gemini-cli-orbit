/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { BaseProvider } from './BaseProvider.js';
import { type ExecOptions, type OrbitStatus } from '../core/types.js';
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';
import { type ProjectContext, MISSION_PREFIX } from '../core/Constants.js';
import { type Command, flattenCommand } from '../core/executors/types.js';
import { type MissionContext } from '../utils/MissionUtils.js';

/**
 * LocalWorktreeProvider: Hierarchical local workspace management.
 * Uses standard hierarchical naming policy from BaseProvider.
 */
export class LocalWorktreeProvider extends BaseProvider {
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
    super();
    this.stationName = stationName;
    // Default to sibling folder named 'orbit-workspaces'
    this.workspacesDir =
      workspacesDir ||
      path.resolve(this.projectCtx.repoRoot, '..', 'orbit-workspaces');

    if (!fs.existsSync(this.workspacesDir)) {
      fs.mkdirSync(this.workspacesDir, { recursive: true });
    }
  }

  private hasTmux(): boolean {
    const res = spawnSync('which', ['tmux'], { stdio: 'pipe' });
    return res.status === 0;
  }

  /**
   * Path resolution (Backend specific root)
   */
  resolveWorkDir(workspaceName: string): string {
    return path.join(this.workspacesDir, workspaceName);
  }

  async ensureReady(): Promise<number> {
    return 0;
  }

  private q(val: string): string {
    return `'${val.replace(/'/g, "'\\''")}'`;
  }

  getRunCommand(command: string, options: ExecOptions = {}): string {
    const envObj = { ...options.env };
    if (options.manifest) {
      envObj.GCLI_ORBIT_MANIFEST = JSON.stringify(options.manifest);
    }

    const envPrefix =
      Object.keys(envObj).length > 0
        ? Object.entries(envObj)
            .map(([k, v]) => `${k}=${this.q(v as string)}`)
            .join(' ') + ' '
        : '';

    const capsuleDir = options.wrapCapsule
      ? path.join(this.workspacesDir, options.wrapCapsule.replace(/-/g, '/'))
      : this.projectCtx.repoRoot;

    if (this.hasTmux()) {
      const sessionName = options.wrapCapsule || 'orbit-local';
      const tip =
        'printf "\\n   \\x1b[38;5;244m💡 Tip: Press \\x1b[38;5;39mCtrl-b d\\x1b[38;5;244m to detach and keep mission running.\\x1b[0m\\n\\n"';
      return `tmux new-session -d -A -s ${this.q(sessionName)} "cd ${this.q(capsuleDir)} && ${tip}; ${envPrefix}${command} || exec zsh"`;
    }
    return `cd ${this.q(capsuleDir)} && ${envPrefix}${command}`;
  }

  async exec(
    command: string | Command,
    options: ExecOptions = {},
  ): Promise<number> {
    const res = await this.getExecOutput(command, options);
    return res.status;
  }

  async getExecOutput(
    command: string | Command,
    options: ExecOptions = {},
  ): Promise<{ status: number; stdout: string; stderr: string }> {
    let cwd = options.cwd || this.projectCtx.repoRoot;
    if (options.wrapCapsule) {
      // Local worktrees are nested: repo/id/action
      cwd = path.join(
        this.workspacesDir,
        options.wrapCapsule.replace(/-/g, '/'),
      );
    }

    const env: any = {
      ...process.env,
      ...options.env,
      GEMINI_AUTO_UPDATE: '0',
    };
    if (options.manifest) {
      env.GCLI_ORBIT_MANIFEST = JSON.stringify(options.manifest);
    }

    const res = spawnSync(flattenCommand(command), {
      stdio: options.quiet ? 'pipe' : 'inherit',
      shell: true,
      cwd,
      env,
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
  async syncIfChanged(): Promise<number> {
    return 0;
  }

  async prepareMissionWorkspace(mCtx: MissionContext): Promise<void> {
    const { branchName, workspaceName } = mCtx;
    const sourceDir = this.projectCtx.repoRoot;
    const wtPath = path.join(this.workspacesDir, workspaceName);

    if (fs.existsSync(wtPath)) return;

    console.log(
      `   🌿 Orbit: Provisioning local workspace for '${branchName}'...`,
    );

    // Ensure the parent directory exists (e.g. orbit-workspaces/repo/)
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });

    spawnSync('git', ['-C', sourceDir, 'fetch', 'origin'], { stdio: 'ignore' });

    const args: string[] = ['worktree', 'add'];
    const localCheck = spawnSync('git', [
      '-C',
      sourceDir,
      'show-ref',
      '--verify',
      `refs/heads/${branchName}`,
    ]);
    const remoteCheck = spawnSync('git', [
      '-C',
      sourceDir,
      'show-ref',
      '--verify',
      `refs/remotes/origin/${branchName}`,
    ]);

    if (localCheck.status === 0) {
      args.push(wtPath, branchName);
    } else if (remoteCheck.status === 0) {
      args.push('-b', branchName, wtPath, `origin/${branchName}`);
    } else {
      console.warn(
        `   ⚠️  Branch '${branchName}' not found. Creating from HEAD.`,
      );
      args.push('-b', branchName, wtPath);
    }

    const res = spawnSync('git', ['-C', sourceDir, ...args], {
      stdio: 'inherit',
    });
    if (res.status !== 0)
      throw new Error(`Failed to create workspace: exit code ${res.status}`);
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
    const wtPath = path.join(this.workspacesDir, name.replace(/-/g, '/'));
    const exists = fs.existsSync(wtPath);
    return { exists, running: exists };
  }

  async getCapsuleStats(): Promise<string> {
    return 'N/A (Local)';
  }
  async getCapsuleIdleTime(): Promise<number> {
    return 0;
  }

  async attach(name: string): Promise<number> {
    if (!this.hasTmux()) return 1;
    const res = spawnSync('tmux', ['attach-session', '-t', name], {
      stdio: 'inherit',
    });
    if (res.status === 0) return 0;

    const listRes = spawnSync('tmux', ['list-sessions', '-F', '#S'], {
      stdio: 'pipe',
    });
    if (listRes.status === 0) {
      const sessions = listRes.stdout.toString().split('\n');
      const bestMatch = sessions.find((s) => s.includes(name));
      if (bestMatch) {
        return (
          spawnSync('tmux', ['attach-session', '-t', bestMatch], {
            stdio: 'inherit',
          }).status ?? 1
        );
      }
    }
    return this.missionShell(name);
  }

  async runCapsule(): Promise<number> {
    throw new Error('Not supported');
  }
  async stopCapsule(name: string): Promise<number> {
    if (this.hasTmux()) spawnSync('tmux', ['kill-session', '-t', name]);
    return 0;
  }

  async removeCapsule(name: string): Promise<number> {
    const sourceDir = this.projectCtx.repoRoot;
    const wtPath = path.join(this.workspacesDir, name.replace(/-/g, '/'));
    if (!fs.existsSync(wtPath)) return 0;

    if (path.resolve(wtPath) === path.resolve(sourceDir)) return 1;

    console.log(`   🔥 Orbit: Removing local workspace: ${name}`);
    spawnSync(
      'git',
      ['-C', sourceDir, 'worktree', 'remove', wtPath, '--force'],
      { stdio: 'inherit' },
    );
    if (this.hasTmux()) spawnSync('tmux', ['kill-session', '-t', name]);
    return 0;
  }

  async capturePane(): Promise<string> {
    return 'N/A (Local)';
  }
  async listStations(): Promise<number> {
    return 0;
  }
  async destroy(): Promise<number> {
    return 0;
  }
  async provisionMirror(): Promise<number> {
    return 0;
  }
  async stationShell(): Promise<number> {
    return spawnSync('zsh', { stdio: 'inherit', shell: true }).status ?? 0;
  }

  async missionShell(name: string): Promise<number> {
    const wtPath = path.join(this.workspacesDir, name.replace(/-/g, '/'));
    return (
      spawnSync('zsh', { stdio: 'inherit', shell: true, cwd: wtPath }).status ??
      0
    );
  }

  async listCapsules(): Promise<string[]> {
    if (!fs.existsSync(this.workspacesDir)) return [];

    const capsules: string[] = [];
    const repos = fs.readdirSync(this.workspacesDir);
    for (const repo of repos) {
      const repoPath = path.join(this.workspacesDir, repo);
      if (fs.statSync(repoPath).isDirectory()) {
        const ids = fs.readdirSync(repoPath);
        for (const id of ids) {
          capsules.push(`${repo}/${id}`);
        }
      }
    }
    return capsules;
  }

  injectState(): void {}
}

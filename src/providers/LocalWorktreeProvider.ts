/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import { BaseProvider } from './BaseProvider.js';
import {
  type ExecOptions,
  type OrbitStatus,
  type CapsuleInfo,
} from '../core/types.js';
import { type ProjectContext, LOCAL_BUNDLE_PATH } from '../core/Constants.js';
import { type Command } from '../core/executors/types.js';
import { type MissionContext } from '../utils/MissionUtils.js';
import {
  type IExecutors,
  type IProcessManager,
  type IRunOptions,
  type StationReceipt,
} from '../core/interfaces.js';

/**
 * LocalWorktreeProvider: Hierarchical local workspace management.
 * Uses standard hierarchical naming policy from BaseProvider.
 */
export class LocalWorktreeProvider extends BaseProvider {
  public readonly type = 'local-worktree';
  public readonly isPersistent = false;
  public projectId = 'local';
  public zone = 'localhost';
  public stationName: string;
  public workspacesDir: string;
  protected fs = fs;

  constructor(
    private readonly projectCtx: ProjectContext,
    pm: IProcessManager,
    executors: IExecutors,
    stationName = 'local',
    workspacesDir: string,
  ) {
    super(pm, executors);
    this.stationName = stationName;
    this.workspacesDir = workspacesDir;
  }

  private hasTmux(): boolean {
    const res = this.pm.runSync('which', ['tmux'], { quiet: true });
    return res.status === 0;
  }

  /**
   * Path resolution (Backend specific root)
   */
  override resolveWorkDir(workspaceName: string): string {
    return path.join(this.workspacesDir, workspaceName);
  }

  override resolveWorkspacesRoot(): string {
    return path.join(this.workspacesDir, this.projectCtx.repoName);
  }

  override resolveWorkerPath(): string {
    return `${LOCAL_BUNDLE_PATH}/station.js`;
  }

  override resolveProjectConfigDir(): string {
    return path.join(this.projectCtx.repoRoot, '.gemini');
  }

  override resolvePolicyPath(repoRoot: string): string {
    return path.join(repoRoot, '.gemini/policies/workspace-policy.toml');
  }

  override resolveMirrorPath(): string {
    return this.projectCtx.repoRoot;
  }

  async ensureReady(): Promise<number> {
    return 0;
  }

  override createNodeCommand(scriptPath: string, args: string[] = []): Command {
    return this.executors.node.create(scriptPath, args);
  }

  getRunCommand(command: string, options: ExecOptions = {}): string {
    const envObj = { ...options.env };
    if (options.manifest) {
      envObj.GCLI_ORBIT_MANIFEST = JSON.stringify(options.manifest);
    }

    const envPrefix =
      Object.keys(envObj).length > 0
        ? Object.entries(envObj)
            .map(([k, v]) => `${k}=${this.shellQuote(v as string)}`)
            .join(' ') + ' '
        : '';

    const capsuleDir = options.cwd || this.projectCtx.repoRoot;

    if (this.hasTmux()) {
      const sessionName = options.isolationId || 'orbit-local';
      const tip =
        'printf "\\n   \\x1b[38;5;244m💡 Tip: Press \\x1b[38;5;39mCtrl-b d\\x1b[38;5;244m to detach and keep mission running.\\x1b[0m\\n\\n"';
      return `tmux new-session -d -A -s ${this.shellQuote(sessionName)} "cd ${this.shellQuote(capsuleDir)} && ${tip}; ${envPrefix}${command} || exec zsh"`;
    }
    return `cd ${this.shellQuote(capsuleDir)} && ${envPrefix}${command}`;
  }

  override resolveIsolationId(mCtx: MissionContext): string {
    return mCtx.sessionName;
  }

  async getExecOutput(
    command: string | Command,
    options: ExecOptions = {},
  ): Promise<{ status: number; stdout: string; stderr: string }> {
    const mergedOptions = {
      ...options,
      ...(typeof command === 'string' ? {} : command.options),
    };

    const cwd = options.cwd || this.projectCtx.repoRoot;

    const env: any = {
      ...process.env,
      ...mergedOptions.env,
      GEMINI_AUTO_UPDATE: '0',
    };

    if (options.manifest) {
      env.GCLI_ORBIT_MANIFEST = JSON.stringify(options.manifest);
    }

    const runOptions: IRunOptions = {
      stdio: 'pipe',
      cwd,
      env,
    };
    if (options.quiet !== undefined) {
      runOptions.quiet = options.quiet;
    }

    const res = this.pm.runSync(
      typeof command === 'string' ? 'sh' : command.bin,
      typeof command === 'string' ? ['-c', command] : command.args,
      runOptions,
    );

    return res;
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

    if (this.fs.existsSync(wtPath)) return;

    console.log(
      `   🌿 Orbit: Provisioning local workspace for '${branchName}'...`,
    );

    // Ensure the parent directory exists (e.g. orbit-workspaces/repo/)
    this.fs.mkdirSync(path.dirname(wtPath), { recursive: true });

    this.pm.runSync('git', ['-C', sourceDir, 'fetch', 'origin'], {
      quiet: true,
    });

    const localCheck = this.pm.runSync(
      'git',
      ['-C', sourceDir, 'show-ref', '--verify', `refs/heads/${branchName}`],
      { quiet: true },
    );
    const remoteCheck = this.pm.runSync(
      'git',
      [
        '-C',
        sourceDir,
        'show-ref',
        '--verify',
        `refs/remotes/origin/${branchName}`,
      ],
      { quiet: true },
    );

    const args: string[] = ['-C', sourceDir, 'worktree', 'add'];

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

    const res = this.pm.runSync('git', args);
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

  async start(): Promise<number> {
    return 0;
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
    const res = this.executors.tmux.attach(name);
    if (res.status === 0) return 0;

    const listRes = this.pm.runSync('tmux', ['list-sessions', '-F', '#S'], {
      quiet: true,
    });
    if (listRes.status === 0) {
      const sessions = listRes.stdout.toString().split('\n');
      const bestMatch = sessions.find((s) => s.includes(name));
      if (bestMatch) {
        return this.executors.tmux.attach(bestMatch).status;
      }
    }
    return this.missionShell(name);
  }

  async runCapsule(): Promise<number> {
    throw new Error('Not supported');
  }
  async stopCapsule(name: string): Promise<number> {
    if (this.hasTmux()) this.pm.runSync('tmux', ['kill-session', '-t', name]);
    return 0;
  }

  async removeCapsule(name: string): Promise<number> {
    const sourceDir = this.projectCtx.repoRoot;
    const wtPath = path.join(this.workspacesDir, name.replace(/-/g, '/'));
    if (!fs.existsSync(wtPath)) return 0;

    if (path.resolve(wtPath) === path.resolve(sourceDir)) return 1;

    console.log(`   🔥 Orbit: Removing local workspace: ${name}`);
    this.pm.runSync('git', [
      '-C',
      sourceDir,
      'worktree',
      'remove',
      wtPath,
      '--force',
    ]);
    if (this.hasTmux()) this.pm.runSync('tmux', ['kill-session', '-t', name]);
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
    return this.pm.runSync('zsh', [], { interactive: true }).status;
  }

  async missionShell(name: string): Promise<number> {
    const wtPath = path.join(this.workspacesDir, name.replace(/-/g, '/'));
    return this.pm.runSync('zsh', [], { interactive: true, cwd: wtPath })
      .status;
  }

  getStationReceipt(): StationReceipt {
    return {
      name: this.stationName,
      instanceName: this.stationName,
      type: 'local-worktree',
      projectId: 'local',
      zone: 'localhost',
      repo: this.projectCtx.repoName,
      rootPath: this.projectCtx.repoRoot,
      workspacesDir: this.workspacesDir,
      lastSeen: new Date().toISOString(),
    };
  }

  async listCapsules(): Promise<string[]> {
    const sourceDir = this.projectCtx.repoRoot;
    const capsules: string[] = [];

    // Use git worktree list for accuracy
    const res = this.pm.runSync(
      'git',
      ['-C', sourceDir, 'worktree', 'list', '--porcelain'],
      { quiet: true },
    );

    if (res.status === 0) {
      const lines = res.stdout.split('\n');
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          const wtPath = line.replace('worktree ', '').trim();

          // SKIP the main repo root itself
          if (path.resolve(wtPath) === path.resolve(this.projectCtx.repoRoot)) {
            continue;
          }

          // Only include if it's within our workspacesDir
          if (wtPath.startsWith(this.workspacesDir)) {
            const relPath = path.relative(this.workspacesDir, wtPath);
            if (relPath && relPath !== '.') {
              // Convert filesystem path back to mission ID slug (repo/id)
              capsules.push(relPath);
            }
          }
        }
      }
    }

    return capsules;
  }

  injectState(): void {}

  protected override async resolveLegacyCapsuleState(
    name: string,
  ): Promise<CapsuleInfo['state']> {
    if (!this.hasTmux()) return 'IDLE';

    const listRes = this.pm.runSync('tmux', ['list-sessions', '-F', '#S'], {
      quiet: true,
    });
    if (listRes.status !== 0) return 'IDLE';

    const sessions = listRes.stdout.toString().split('\n');
    const bestMatch = sessions.find((s) => s.includes(name));

    if (bestMatch) {
      // For local, we just assume it's THINKING if the session exists
      return 'THINKING';
    }

    return 'IDLE';
  }
}

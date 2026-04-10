/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import { BaseProvider } from './BaseProvider.js';
import {
  type ExecOptions,
  type OrbitStatus,
  type CapsuleInfo,
} from '../core/types.js';
import {
  type ProjectContext,
  type InfrastructureSpec,
  LOCAL_MANIFEST_NAME,
} from '../core/Constants.js';
import { type Command } from '../core/executors/types.js';
import {
  type MissionContext,
  resolveMissionContext,
} from '../utils/MissionUtils.js';
import {
  type IExecutors,
  type IProcessManager,
  type IRunOptions,
  type StationReceipt,
} from '../core/interfaces.js';

import type fsNamespace from 'node:fs';

/**
 * Local Worktree Execution Provider.
 * Orchestrates missions on the local machine using 'git worktree'.
 */
export class LocalWorktreeProvider extends BaseProvider {
  public readonly type = 'local-worktree';
  public readonly isPersistent = true;

  public readonly projectId = 'local';
  public readonly zone = 'local';
  public readonly stationName: string;

  private readonly workspacesDir: string;

  constructor(
    private readonly projectCtx: ProjectContext,
    private readonly fs: typeof fsNamespace,
    pm: IProcessManager,
    executors: IExecutors,
    workspacesDir: string,
    private readonly infra: InfrastructureSpec,
    config: { stationName?: string } = {},
  ) {
    super(pm, executors);
    this.stationName = config.stationName || `local-${projectCtx.repoName}`;
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

  /**
   * Returns the primary root for Orbit data inside the capsule.
   */
  resolveCapsuleOrbitRoot(): string {
    return this.projectCtx.repoRoot;
  }

  resolveBundlePath(): string {
    return path.resolve(this.projectCtx.repoRoot, 'bundle');
  }

  resolveWorkerPath(): string {
    return path.resolve(this.projectCtx.repoRoot, 'bundle/station.js');
  }

  override resolveProjectConfigDir(): string {
    return path.join(this.projectCtx.repoRoot, '.gemini');
  }

  override resolveGlobalConfigDir(): string {
    return path.join(os.homedir(), '.gemini');
  }

  override resolvePolicyPath(): string {
    return path.join(
      this.projectCtx.repoRoot,
      '.gemini/policies/workspace-policy.toml',
    );
  }

  override resolveMirrorPath(): string {
    return this.projectCtx.repoRoot;
  }

  async ensureReady(): Promise<number> {
    return 0;
  }

  async verifyIgnition(): Promise<boolean> {
    // Local worktrees are always "ignited" as they use the host machine
    return true;
  }

  override createNodeCommand(scriptPath: string, args: string[] = []): Command {
    return this.executors.node.create(scriptPath, args);
  }

  getRunCommand(command: string, options: ExecOptions = {}): string {
    const capsuleDir = options.cwd || this.projectCtx.repoRoot;

    if (this.hasTmux()) {
      const sessionName = options.isolationId || 'orbit-local';
      const tmuxCmd = this.executors.tmux.wrapMission(sessionName, command, {
        cwd: capsuleDir,
        ...(options.env ? { env: options.env } : {}),
      });
      return `${tmuxCmd.bin} ${tmuxCmd.args.join(' ')}`;
    }
    return `cd ${this.shellQuote(capsuleDir)} && ${command}`;
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
      COLORTERM: 'truecolor',
      FORCE_COLOR: '3',
      TERM: 'xterm-256color',
      TERM_PROGRAM: process.env.TERM_PROGRAM || 'iTerm.app',
      GEMINI_AUTO_UPDATE: '0',
    };

    const runOptions: IRunOptions = {
      stdio: 'pipe',
      cwd,
      env,
    };
    if (options.quiet !== undefined) {
      runOptions.quiet = options.quiet;
    }

    if (typeof command === 'string') {
      return this.pm.runSync('/bin/bash', ['-c', command], runOptions);
    }

    return this.pm.runSync(command.bin, command.args, runOptions);
  }

  async sync(): Promise<number> {
    return 0;
  }
  async syncIfChanged(): Promise<number> {
    return 0;
  }

  async prepareMissionWorkspace(
    mCtx: MissionContext,
    infra: InfrastructureSpec,
  ): Promise<void> {
    const { branchName, workspaceName } = mCtx;
    const sourceDir = this.projectCtx.repoRoot;
    const wtPath = path.join(this.workspacesDir, workspaceName);

    if (!this.fs.existsSync(wtPath)) {
      console.log(
        `   🌿 Orbit: Provisioning local workspace for '${branchName}'...`,
      );

      // 1. Safe Directory Creation
      try {
        this.fs.mkdirSync(path.dirname(wtPath), { recursive: true });
      } catch (_e) {}

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

      const res = this.pm.runSync('git', args, { quiet: true });

      if (res.status !== 0 && !this.fs.existsSync(wtPath)) {
        throw new Error(
          `Failed to create workspace: exit code ${res.status}\n${res.stderr}`,
        );
      }
    }

    // 2. Write Manifest-on-Disk (replaces environment variable)
    const manifestJson = JSON.stringify({
      identifier: mCtx.idSlug,
      repoName: this.projectCtx.repoName,
      branchName: mCtx.branchName,
      action: mCtx.action,
      workDir: wtPath,
      containerName: mCtx.containerName,
      sessionName: mCtx.sessionName,
      policyPath: this.resolvePolicyPath(),
      upstreamUrl: (infra as any).upstreamUrl,
      mirrorPath: sourceDir,
      bundleDir: this.resolveBundlePath(),
      tempDir: this.workspacesDir,
    });

    this.fs.writeFileSync(path.join(wtPath, LOCAL_MANIFEST_NAME), manifestJson);
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
    // For local, we check tmux sessions
    if (!this.hasTmux()) return { running: false, exists: false };
    const res = this.pm.runSync('tmux', ['has-session', '-t', name], {
      quiet: true,
    });
    return { running: res.status === 0, exists: res.status === 0 };
  }

  async getCapsuleStats(): Promise<string> {
    return 'N/A (Local)';
  }

  async getCapsuleIdleTime(): Promise<number> {
    return 0;
  }

  async attach(name: string, _sessionName?: string): Promise<number> {
    if (!this.hasTmux()) throw new Error('tmux is required for local missions');
    return this.pm.runSync('tmux', ['attach-session', '-t', name], {
      stdio: 'inherit',
    }).status;
  }

  async runCapsule(): Promise<number> {
    // Local capsules are tmux sessions, handled by getRunCommand
    return 0;
  }

  async stopCapsule(name: string): Promise<number> {
    if (!this.hasTmux()) return 0;
    return this.pm.runSync('tmux', ['kill-session', '-t', name], {
      quiet: true,
    }).status;
  }

  async removeCapsule(name: string): Promise<number> {
    const wtPath = path.join(this.workspacesDir, name);

    // 1. Remove the worktree
    this.pm.runSync(
      'git',
      ['-C', this.projectCtx.repoRoot, 'worktree', 'remove', wtPath, '--force'],
      { quiet: true },
    );

    // 2. Kill associated tmux sessions
    // Cleanup session if name represents a session-safe slug
    if (this.hasTmux()) {
      // Try both slashed and hyphenated names for robust cleanup
      this.pm.runSync('tmux', ['kill-session', '-t', name.replace(/\//g, '-')]);
      this.pm.runSync('tmux', ['kill-session', '-t', name]);
    }
    return 0;
  }

  async jettisonMission(identifier: string, action?: string): Promise<number> {
    const { repoSlug, idSlug } = resolveMissionContext(
      identifier,
      this.projectCtx.repoName,
      this.pm,
    );

    if (action) {
      // 1. Surgical Action Cleanup: Kill only the specific session
      const sessionName = this.resolveSessionName(repoSlug, idSlug, action);
      if (this.hasTmux()) {
        this.pm.runSync('tmux', ['kill-session', '-t', sessionName], {
          quiet: true,
        });
      }

      // ADR: If this was the LAST session for this mission ID, clean up the worktree too
      if (this.hasTmux()) {
        const missionPrefix = `${repoSlug}/${idSlug}/`; // Trailing slash is key
        const chatSession = this.resolveSessionName(repoSlug, idSlug, 'chat'); // The non-action one

        const listRes = this.pm.runSync('tmux', ['list-sessions', '-F', '#S'], {
          quiet: true,
        });
        const sessions = (listRes.stdout || '').split('\n');

        const otherSessions = sessions.filter((s) => {
          if (s === sessionName) return false;
          return s === chatSession || s.startsWith(missionPrefix);
        });

        if (otherSessions.length === 0) {
          const workspaceName = this.resolveWorkspaceName(repoSlug, idSlug);
          await this.removeCapsule(workspaceName);
        }
      }
      return 0;
    }

    // 2. Full Mission Cleanup: Remove worktree AND all associated sessions
    const workspaceName = this.resolveWorkspaceName(repoSlug, idSlug);
    const res = await this.removeCapsule(workspaceName);

    if (this.hasTmux()) {
      const actions = ['chat', 'fix', 'review', 'implement'];
      for (const act of actions) {
        const sessionName = this.resolveSessionName(repoSlug, idSlug, act);
        this.pm.runSync('tmux', ['kill-session', '-t', sessionName], {
          quiet: true,
        });
      }
    }

    return res;
  }

  async splashdown(): Promise<number> {
    // Local splashdown: Remove all local mission capsules
    const capsules = await this.listCapsules();
    for (const capsule of capsules) {
      await this.removeCapsule(capsule);
    }
    return 0;
  }

  async removeSecret(): Promise<void> {
    // Local provider does not use isolated secrets
    return;
  }

  async capturePane(name: string): Promise<string> {
    if (!this.hasTmux()) return 'N/A (No Tmux)';
    const res = this.pm.runSync(
      'tmux',
      ['capture-pane', '-pt', this.shellQuote(name)],
      { quiet: true },
    );
    if (res.status !== 0) return 'N/A (Capture failed)';

    const lines = (res.stdout || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => {
        if (!l) return false;
        if (l.includes('ProjectRegistry')) return false;
        if (l.includes('file:///')) return false;
        if (l.includes('A new version of Gemini CLI')) return false;
        if (l.includes('orbit-git-worktrees')) return false;
        return true;
      });

    return lines.slice(-20).join('\n');
  }

  async listStations(): Promise<number> {
    return 0;
  }

  async destroy(): Promise<number> {
    return 0;
  }

  async listCapsules(): Promise<string[]> {
    if (!this.hasTmux()) return [];
    const res = this.pm.runSync('tmux', ['list-sessions', '-F', '#S'], {
      quiet: true,
    });
    if (res.status !== 0) return [];

    const sessions = (res.stdout || '').split('\n').filter(Boolean);
    // Find sessions that look like Orbit sessions (repo/id or repo/id/action)
    return sessions.filter((s) => s.includes('/'));
  }

  async provisionMirror(): Promise<number> {
    return 0;
  }

  async stationShell(): Promise<number> {
    return this.pm.runSync('/bin/zsh', [], { stdio: 'inherit' }).status;
  }

  async missionShell(name: string): Promise<number> {
    return this.attach(name);
  }

  getStationReceipt(): StationReceipt {
    return {
      name: this.stationName,
      instanceName: 'local',
      type: 'local-worktree',
      projectId: 'local',
      zone: 'local',
      repo: this.projectCtx.repoName,
      upstreamUrl: this.infra.upstreamUrl,
      networkAccessType: 'direct-internal',
      lastSeen: new Date().toISOString(),
    };
  }

  protected override async resolveLegacyCapsuleState(
    name: string,
  ): Promise<CapsuleInfo['state']> {
    const isRunning = await this.getCapsuleStatus(name);

    if (isRunning.running) {
      const thoughts = await this.capturePane(name);
      const lines = thoughts.trim().split('\n');

      // Check last few lines for prompt indicators (larger window for boxes/multi-line prompts)
      const lastFew = lines.slice(-15).join(' ');

      if (lastFew.toLowerCase().includes('allow execution')) {
        return 'WAITING_FOR_APPROVAL';
      }

      const isWaiting =
        lastFew.includes('❯') ||
        lastFew.includes('$') ||
        lastFew.includes('%') ||
        lastFew.includes('>') ||
        lastFew.includes('(y/n)') ||
        lastFew.trim().endsWith('?');

      return isWaiting ? 'WAITING_FOR_INPUT' : 'THINKING';
    }

    return 'IDLE';
  }
}

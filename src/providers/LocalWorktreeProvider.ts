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
  getLocalMissionManifestPath,
  type ProjectContext,
  type InfrastructureSpec,
  LOCAL_MANIFEST_ENV,
} from '../core/Constants.js';
import { type Command } from '../core/executors/types.js';
import {
  type MissionContext,
  resolveMissionContext,
} from '../utils/MissionUtils.js';
import { sanitizeName } from '../core/ConfigManager.js';
import { WindowsGitExecutor } from '../core/executors/WindowsGitExecutor.js';
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
  private readonly windowsGit: WindowsGitExecutor | undefined;

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
    this.windowsGit =
      process.platform === 'win32' ? new WindowsGitExecutor(pm) : undefined;
  }

  private hasTmux(): boolean {
    const cmd = this.executors.tmux.version();
    const res = this.pm.runSync(cmd.bin, cmd.args, {
      ...cmd.options,
      quiet: true,
    });
    return res.status === 0;
  }

  private resolveExistingWorkspacePath(
    target: string,
    fallbackName: string,
  ): string {
    const parts = target.split('/');
    const workspaceName =
      parts.length >= 2 ? path.join(parts[0]!, parts[1]!) : fallbackName;
    const directPath = path.join(this.workspacesDir, workspaceName);
    if (this.fs.existsSync(directPath)) {
      return directPath;
    }

    const idSlug = parts.length >= 2 ? parts[1] : fallbackName.split('/').pop();
    if (!idSlug || !this.fs.existsSync(this.workspacesDir)) {
      return directPath;
    }

    try {
      const repoDirs = this.fs.readdirSync(this.workspacesDir);
      for (const repoDir of repoDirs) {
        const candidate = path.join(this.workspacesDir, repoDir, idSlug);
        if (this.fs.existsSync(candidate)) {
          return candidate;
        }
      }
    } catch (_e) {}

    return directPath;
  }

  private writeLocalManifest(manifest: Record<string, unknown>): string {
    const sessionName = String(manifest.sessionName || 'local-mission');
    const manifestPath = getLocalMissionManifestPath(sessionName);
    this.fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    this.fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    return manifestPath;
  }

  private gitRun(
    args: string[],
    options: IRunOptions = {},
  ): { status: number; stdout: string; stderr: string } {
    if (this.windowsGit) {
      return this.windowsGit.runSync(args, options);
    }
    return this.pm.runSync('git', args, options);
  }

  private resolveWorkspaceNameFromCapsule(name: string): string {
    if (name.includes('/')) {
      const [repoSlug, idSlug] = name.split('/');
      return path.join(repoSlug || this.projectCtx.repoName, idSlug || name);
    }

    const repoSlug = sanitizeName(this.projectCtx.repoName);
    if (process.platform === 'win32' && name.startsWith(`${repoSlug}-`)) {
      let idSlug = name.slice(repoSlug.length + 1);
      for (const action of ['review', 'fix', 'implement']) {
        const suffix = `-${action}`;
        if (idSlug.endsWith(suffix)) {
          idSlug = idSlug.slice(0, -suffix.length);
          break;
        }
      }
      return path.join(repoSlug, idSlug);
    }

    return name;
  }

  private listWorkspaceNames(): string[] {
    if (!this.fs.existsSync(this.workspacesDir)) {
      return [];
    }

    const workspaces: string[] = [];

    try {
      const repoDirs = this.fs.readdirSync(this.workspacesDir);
      for (const repoDir of repoDirs) {
        const repoPath = path.join(this.workspacesDir, repoDir);
        if (!this.fs.statSync(repoPath).isDirectory()) {
          continue;
        }

        const missionDirs = this.fs.readdirSync(repoPath);
        for (const missionDir of missionDirs) {
          const missionPath = path.join(repoPath, missionDir);
          if (this.fs.statSync(missionPath).isDirectory()) {
            workspaces.push(path.join(repoDir, missionDir));
          }
        }
      }
    } catch (_e) {}

    return workspaces;
  }

  private isOrbitSession(name: string): boolean {
    if (name.includes('/')) {
      return true;
    }

    if (process.platform !== 'win32') {
      return false;
    }

    const repoSlug = sanitizeName(this.projectCtx.repoName);
    return name.startsWith(`${repoSlug}-`);
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
      TERM_PROGRAM: process.env.TERM_PROGRAM || 'Orbit',
      GEMINI_AUTO_UPDATE: '0',
    };

    if (options.manifest) {
      env[LOCAL_MANIFEST_ENV] = this.writeLocalManifest(options.manifest);
    }

    const runOptions: IRunOptions = {
      stdio: 'pipe',
      cwd,
      env,
    };
    if (options.quiet !== undefined) {
      runOptions.quiet = options.quiet;
    }

    if (typeof command === 'string') {
      const isWin = process.platform === 'win32';
      const shellBin = isWin ? 'powershell.exe' : '/bin/bash';
      const shellArgs = isWin
        ? ['-NoProfile', '-Command', command]
        : ['-c', command];
      return this.pm.runSync(shellBin, shellArgs, runOptions);
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

      this.gitRun(['-C', sourceDir, 'fetch', 'origin', branchName], {
        quiet: true,
      });

      const localCheck = this.gitRun(
        ['-C', sourceDir, 'show-ref', '--verify', `refs/heads/${branchName}`],
        { quiet: true },
      );
      const remoteCheck = this.gitRun(
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

      const res = this.gitRun(args, { quiet: true });

      if (res.status !== 0 && !this.fs.existsSync(wtPath)) {
        throw new Error(
          `Failed to create workspace: exit code ${res.status}\n${res.stderr}`,
        );
      }
    }

    const legacyManifestPath = path.join(wtPath, '.orbit-manifest.json');
    if (this.fs.existsSync(legacyManifestPath)) {
      try {
        this.fs.rmSync(legacyManifestPath, { force: true });
      } catch (_e) {}
    }

    // 2. Persist manifest outside the workspace to avoid repo/worktree noise.
    this.writeLocalManifest({
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
    const cmd = this.executors.tmux.hasSession(name);
    const res = this.pm.runSync(cmd.bin, cmd.args, {
      ...cmd.options,
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

  /**
   * STARFLEET FAST-PATH: Local worktrees run directly on the host.
   */
  async launchMission(manifest: any): Promise<number> {
    const {
      sessionName,
      workDir,
      bundleDir,
      identifier,
      action,
      env = {},
    } = manifest;

    console.info(
      `[LOCAL] 🚀 Launching mission '${identifier}' via local tmux...`,
    );

    // 1. Prepare Environment
    const missionEnv = {
      ...env,
      GCLI_ORBIT_MISSION_ID: identifier,
      GCLI_ORBIT_ACTION: action,
      GCLI_ORBIT_SESSION_NAME: sessionName,
      GCLI_ORBIT_BUNDLE_DIR: bundleDir,
      [LOCAL_MANIFEST_ENV]: getLocalMissionManifestPath(sessionName),
      GCLI_TRUST: '1',
    };

    // 2. Prepare Command
    const workerScript = path.join(bundleDir, 'mission.js');

    if (!this.hasTmux()) {
      throw new Error(
        'tmux is required for local-worktree missions but is not available.',
      );
    }

    if (action === 'chat') {
      const cmd = this.executors.tmux.wrap(
        sessionName,
        `node ${this.shellQuote(workerScript)}`,
        {
          cwd: workDir,
          env: missionEnv,
          detached: false,
          interactive: true,
          stdio: 'inherit',
        },
      );

      return this.pm.runSync(cmd.bin, cmd.args, cmd.options).status;
    }

    const cmd = this.executors.tmux.wrapMission(
      sessionName,
      `node ${this.shellQuote(workerScript)}`,
      {
        cwd: workDir,
        env: missionEnv,
      },
    );

    // 3. Launch in Background
    this.pm.spawn(cmd.bin, cmd.args, cmd.options);

    console.info(
      `[LOCAL] ✨ Mission worker launched in session: ${sessionName}`,
    );
    return 0;
  }

  async attach(name: string, _sessionName?: string): Promise<number> {
    const target = _sessionName || name;

    if (!this.hasTmux()) {
      console.error(
        '❌ tmux is required to attach to a local-worktree mission.',
      );
      return 1;
    }

    return this.executors.tmux.attach(target).status;
  }

  async runCapsule(): Promise<number> {
    // Local capsules are tmux sessions, handled by getRunCommand
    return 0;
  }

  async stopCapsule(name: string): Promise<number> {
    if (!this.hasTmux()) return 0;
    const cmd = this.executors.tmux.killSession(name);
    return this.pm.runSync(cmd.bin, cmd.args, cmd.options).status;
  }

  async removeCapsule(name: string): Promise<number> {
    const workspaceName = this.resolveWorkspaceNameFromCapsule(name);
    const wtPath = path.join(this.workspacesDir, workspaceName);

    // 1. Remove the worktree
    this.gitRun(
      ['-C', this.projectCtx.repoRoot, 'worktree', 'remove', wtPath, '--force'],
      { quiet: true },
    );

    // 2. Kill associated tmux sessions
    if (this.hasTmux()) {
      // Robust: try both names to ensure cleanup on Windows vs Linux
      const slashed = name;
      const hyphenated = name.replace(/\//g, '-');
      let cmd = this.executors.tmux.killSession(hyphenated);
      this.pm.runSync(cmd.bin, cmd.args, { ...cmd.options, quiet: true });
      if (slashed !== hyphenated) {
        cmd = this.executors.tmux.killSession(slashed);
        this.pm.runSync(cmd.bin, cmd.args, { ...cmd.options, quiet: true });
      }
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
        const cmd = this.executors.tmux.killSession(sessionName);
        this.pm.runSync(cmd.bin, cmd.args, cmd.options);
      }

      // ADR: If this was the LAST session for this mission ID, clean up the worktree too
      if (this.hasTmux()) {
        const missionPrefix = `${repoSlug}/${idSlug}/`; // Trailing slash is key
        const chatSession = this.resolveSessionName(repoSlug, idSlug, 'chat'); // The non-action one

        const listCmd = this.executors.tmux.listSessions();
        const listRes = this.pm.runSync(
          listCmd.bin,
          listCmd.args,
          listCmd.options,
        );
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
        const cmd = this.executors.tmux.killSession(sessionName);
        this.pm.runSync(cmd.bin, cmd.args, cmd.options);
      }
    }

    return res;
  }

  async splashdown(): Promise<number> {
    // Local splashdown: Remove all local mission capsules
    const workspaces = this.listWorkspaceNames();
    for (const workspace of workspaces) {
      await this.removeCapsule(workspace);
    }
    return 0;
  }

  async removeSecret(): Promise<void> {
    // Local provider does not use isolated secrets
    return;
  }

  async capturePane(name: string): Promise<string> {
    if (!this.hasTmux()) return 'N/A (No Tmux)';
    const cmd = this.executors.tmux.capturePane(name);
    const res = this.pm.runSync(cmd.bin, cmd.args, {
      ...cmd.options,
      quiet: true,
    });
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
    const cmd = this.executors.tmux.listSessions();
    const res = this.pm.runSync(cmd.bin, cmd.args, {
      ...cmd.options,
      quiet: true,
    });
    if (res.status !== 0) return [];

    const sessions = (res.stdout || '').split('\n').filter(Boolean);
    return sessions.filter((s) => this.isOrbitSession(s));
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

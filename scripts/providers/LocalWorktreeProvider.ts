/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  type OrbitProvider,
  type SetupOptions,
  type ExecOptions,
  type SyncOptions,
  type OrbitStatus,
  type CapsuleConfig,
} from './BaseProvider.js';

/**
 * LocalWorktreeProvider manages local git worktrees as isolated "capsules".
 * This allows "multithreaded" development on the local machine without
 * the overhead of Docker or remote VMs.
 */
export class LocalWorktreeProvider implements OrbitProvider {
  public projectId: string = 'local';
  public zone: string = 'localhost';
  public stationName: string;
  private worktreesDir: string;

  constructor(
    stationName: string = 'local-station',
    worktreesDir: string = path.join(os.homedir(), 'dev/orbit/worktrees')
  ) {
    this.stationName = stationName;
    this.worktreesDir = worktreesDir;
    
    if (!fs.existsSync(this.worktreesDir)) {
      fs.mkdirSync(this.worktreesDir, { recursive: true });
    }
  }

  async provision(): Promise<number> {
    console.log(`🏠 Ensuring local worktrees directory: ${this.worktreesDir}`);
    return 0;
  }

  async ensureReady(): Promise<number> {
    return 0;
  }

  async setup(options: SetupOptions): Promise<number> {
    return 0;
  }

  private quote(val: string): string {
    return `'${val.replace(/'/g, "'\\''")}'`;
  }

  getRunCommand(command: string, options: ExecOptions = {}): string {
    let finalCmd = command;
    const envPrefix = options.env ? Object.entries(options.env).map(([k, v]) => `${k}=${this.quote(v)}`).join(' ') + ' ' : '';
    
    if (options.wrapCapsule) {
       // Capsule is the worktree directory name
       const capsulePath = path.join(this.worktreesDir, options.wrapCapsule);
       finalCmd = `cd ${capsulePath} && ${envPrefix}${command}`;
    } else {
       finalCmd = `${envPrefix}${command}`;
    }
    return finalCmd;
  }

  async exec(command: string, options: ExecOptions = {}): Promise<number> {
    const res = await this.getExecOutput(command, options);
    return res.status;
  }

  async getExecOutput(command: string, options: ExecOptions = {}): Promise<{ status: number; stdout: string; stderr: string }> {
    const finalCmd = command;
    let cwd = options.cwd || process.cwd();

    if (options.wrapCapsule) {
      cwd = path.join(this.worktreesDir, options.wrapCapsule);
    }

    const res = spawnSync(finalCmd, { 
        stdio: options.quiet ? 'pipe' : 'inherit', 
        shell: true, 
        cwd,
        env: { ...process.env, GEMINI_AUTO_UPDATE: '0' }
    });

    return {
      status: res.status ?? (res.error ? 1 : 0),
      stdout: res.stdout?.toString() || '',
      stderr: res.stderr?.toString() || '',
    };
  }

  async sync(localPath: string, remotePath: string, options: SyncOptions = {}): Promise<number> {
    // For local worktree, this is essentially a no-op if paths are same, 
    // or a copy if they are different.
    if (path.resolve(localPath) === path.resolve(remotePath)) return 0;
    
    const res = spawnSync(`cp -r ${localPath} ${remotePath}`, { shell: true, stdio: 'inherit' });
    return res.status ?? 0;
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

  async getCapsuleStatus(name: string): Promise<{ running: boolean; exists: boolean }> {
    const capsulePath = path.join(this.worktreesDir, name);
    const exists = fs.existsSync(capsulePath);
    return { running: exists, exists };
  }

  async runCapsule(config: CapsuleConfig): Promise<number> {
    const capsulePath = path.join(this.worktreesDir, config.name);
    
    if (fs.existsSync(capsulePath)) {
        console.log(`   ✅ Local worktree already exists: ${capsulePath}`);
        return 0;
    }

    console.log(`   🌿 Creating local worktree: ${config.name}...`);
    
    // We expect the 'image' field to be the source repository path for local-worktree
    const sourceRepo = config.image; 
    
    // git worktree add <path> <branch>
    // Note: This assumes we want a specific branch. 
    // In orbit, we usually do this via 'gh pr checkout' later, but worktree add needs a start point.
    const res = spawnSync(`git -C ${sourceRepo} worktree add ${capsulePath} -b ${config.name} main`, { shell: true, stdio: 'inherit' });
    
    return res.status ?? 0;
  }

  async removeCapsule(name: string): Promise<number> {
    const capsulePath = path.join(this.worktreesDir, name);
    if (!fs.existsSync(capsulePath)) return 0;

    console.log(`   🔥 Removing local worktree: ${name}...`);
    const res = spawnSync(`git worktree remove ${capsulePath} --force`, { shell: true, stdio: 'inherit' });
    return res.status ?? 0;
  }

  async capturePane(capsuleName: string): Promise<string> {
    // Local capture could use tmux if session name matches
    const res = spawnSync(`tmux capture-pane -pt ${capsuleName} 2>/dev/null`, { shell: true, stdio: 'pipe' });
    return res.stdout?.toString() || '';
  }

  async listStations(): Promise<number> {
    console.log(`🏠 Local Station: ${this.stationName} is RUNNING.`);
    return 0;
  }

  async destroy(): Promise<number> {
    console.log(`🔥 Removing all local worktrees in ${this.worktreesDir}...`);
    const res = spawnSync(`rm -rf ${this.worktreesDir}`, { shell: true, stdio: 'inherit' });
    return res.status ?? 0;
  }

  async listCapsules(): Promise<string[]> {
    if (!fs.existsSync(this.worktreesDir)) return [];
    return fs.readdirSync(this.worktreesDir);
  }
}

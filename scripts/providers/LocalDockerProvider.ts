/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  type OrbitProvider,
  type SetupOptions,
  type ExecOptions,
  type SyncOptions,
  type OrbitStatus,
  type CapsuleConfig,
} from './BaseProvider.js';

/**
 * LocalDockerProvider manages local Docker containers as isolated capsules.
 */
export class LocalDockerProvider implements OrbitProvider {
  public projectId: string = 'local';
  public zone: string = 'localhost';
  public stationName: string;

  constructor(stationName: string = 'local-docker-station') {
    this.stationName = stationName;
  }

  async provision(options?: { setupNetwork?: boolean; sessionId?: string }): Promise<number> {
    console.log(`🐳 Verifying local Docker availability...`);
    const res = spawnSync('docker', ['info'], { stdio: 'pipe' });
    if (res.status !== 0) {
       console.error('❌ Docker is not running or not found in PATH.');
       return 1;
    }
    return 0;
  }

  async ensureReady(): Promise<number> {
    return this.provision();
  }

  async setup(_options: SetupOptions): Promise<number> {
    return 0;
  }

  getRunCommand(command: string, options: ExecOptions = {}): string {
    let finalCmd = command;
    const envFlags = options.env ? Object.entries(options.env).map(([k, v]) => `-e ${k}=${this.quote(v)}`).join(' ') : '';
    const sensitiveFlags = options.sensitiveEnv ? Object.entries(options.sensitiveEnv).map(([k, v]) => `-e ${k}=${this.quote(v)}`).join(' ') : '';
    
    if (options.wrapCapsule) {
      finalCmd = `docker exec ${options.interactive ? '-it' : ''} ${options.cwd ? `-w ${options.cwd}` : ''} ${envFlags} ${sensitiveFlags} ${options.wrapCapsule} sh -c ${this.quote(command)}`;
    }
    return finalCmd;
  }

  async exec(command: string, options: ExecOptions = {}): Promise<number> {
    const res = await this.getExecOutput(command, options);
    return res.status;
  }

  async getExecOutput(command: string, options: ExecOptions = {}): Promise<{ status: number; stdout: string; stderr: string }> {
    const args = options.wrapCapsule ? 
        ['docker', 'exec', ...(options.interactive ? ['-it'] : []), ...(options.cwd ? ['-w', options.cwd] : []), ...(options.env ? Object.entries(options.env).flatMap(([k, v]) => ['-e', `${k}=${v}`]) : []), ...(options.sensitiveEnv ? Object.entries(options.sensitiveEnv).flatMap(([k, v]) => ['-e', `${k}=${v}`]) : []), options.wrapCapsule, 'sh', '-c', command] :
        ['sh', '-c', command];

    if (args.length === 0) return { status: 1, stdout: '', stderr: 'No command arguments' };
    const res = spawnSync(args[0]!, args.slice(1), {
 
        stdio: options.quiet ? 'pipe' : 'inherit', 
        shell: false,
        env: { ...process.env, GEMINI_AUTO_UPDATE: '0' }
    });

    return {
      status: res.status ?? (res.error ? 1 : 0),
      stdout: res.stdout?.toString() || '',
      stderr: res.stderr?.toString() || '',
    };
  }

  async sync(localPath: string, remotePath: string, _options: SyncOptions = {}): Promise<number> {
    // For local docker, this is 'docker cp' if remotePath is inside a container, 
    // but here we are syncing between local host and... well, for local it's often a mount.
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
    const res = spawnSync(`docker inspect -f '{{.State.Running}}' ${name}`, { shell: true, stdio: 'pipe' });
    if (res.status !== 0) return { running: false, exists: false };
    return { running: res.stdout?.toString().trim() === 'true', exists: true };
  }

  async runCapsule(config: CapsuleConfig): Promise<number> {
    const mountFlags = config.mounts.map(m => `-v ${m.host}:${m.capsule}${m.readonly ? ':ro' : ':rw'}`).join(' ');
    const envFlags = config.env ? Object.entries(config.env).map(([k, v]) => `-e ${k}=${this.quote(v)}`).join(' ') : '';
    const sensitiveFlags = config.sensitiveEnv ? Object.entries(config.sensitiveEnv).map(([k, v]) => `-e ${k}=${this.quote(v)}`).join(' ') : '';
    const limits = `${config.cpuLimit ? `--cpus=${config.cpuLimit}` : ''} ${config.memoryLimit ? `--memory=${config.memoryLimit}` : ''}`;
    
    const dockerCmd = `docker run -d --name ${config.name} --restart always ${config.user ? `--user ${config.user}` : ''} ${limits} ${mountFlags} ${envFlags} ${sensitiveFlags} ${config.image} ${config.command || ''}`;
    
    const res = spawnSync(dockerCmd, { shell: true, stdio: 'inherit' });
    return res.status ?? 0;
  }

  async removeCapsule(name: string): Promise<number> {
    const res = spawnSync(`docker rm -f ${name} || true`, { shell: true, stdio: 'inherit' });
    return res.status ?? 0;
  }

  async capturePane(capsuleName: string): Promise<string> {
    const res = spawnSync(`tmux capture-pane -pt ${capsuleName} 2>/dev/null`, { shell: true, stdio: 'pipe' });
    return res.stdout?.toString() || '';
  }

  async listStations(): Promise<number> {
    console.log(`🐳 Local Docker: ${this.stationName} is RUNNING.`);
    return 0;
  }

  async destroy(): Promise<number> {
    return 0;
  }

  async listCapsules(): Promise<string[]> {
      const res = spawnSync("docker ps --format '{{.Names}}' | grep '^gcli-'", { shell: true, stdio: 'pipe' });
      if (res.status === 0 && res.stdout) {
          return res.stdout.toString().trim().split('\n').filter(Boolean);
      }
      return [];
  }

  private quote(str: string) { return `'${str.replace(/'/g, "'\\''")}'`; }
}

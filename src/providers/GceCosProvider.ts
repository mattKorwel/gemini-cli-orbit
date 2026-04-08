/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { BaseProvider } from './BaseProvider.js';
import {
  type ExecOptions,
  type SyncOptions,
  type OrbitStatus,
  type CapsuleConfig,
  type CapsuleInfo,
} from '../core/types.js';
import type { InfrastructureState } from '../infrastructure/InfrastructureState.js';
import { type SSHManager, type RemoteCommand } from './SSHManager.js';
import { type Command } from '../core/executors/types.js';
import { RemoteProvisioner } from '../sdk/RemoteProvisioner.js';
import { logger } from '../core/Logger.js';
import {
  type ProjectContext,
  type InfrastructureSpec,
  STATION_BUNDLE_PATH,
  ORBIT_ROOT,
  MAIN_REPO_PATH,
  BUNDLE_PATH,
  LOCAL_BUNDLE_PATH,
  CONFIG_DIR,
  GLOBAL_SETTINGS_FILE,
  GLOBAL_ACCOUNTS_FILE,
  GLOBAL_GH_CONFIG,
} from '../core/Constants.js';
import {
  type MissionContext,
  resolveMissionContext,
} from '../utils/MissionUtils.js';
import {
  type IExecutors,
  type IProcessManager,
  type StationReceipt,
} from '../core/interfaces.js';

export class ConnectivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectivityError';
  }
}

/**
 * GCE Container-Optimized OS (COS) Execution Provider.
 * Overrides BaseProvider to maintain legacy flat naming structure.
 */
export class GceCosProvider extends BaseProvider {
  public readonly type = 'gce';
  public readonly isPersistent = true;

  public readonly projectId: string;
  public readonly zone: string;
  public readonly stationName: string;

  private readonly instanceName: string;
  private readonly repoRoot: string;
  private readonly imageUri: string;
  private readonly ssh: SSHManager;

  constructor(
    private readonly projectCtx: ProjectContext,
    projectId: string,
    zone: string,
    instanceName: string,
    repoRoot: string,
    ssh: SSHManager,
    pm: IProcessManager,
    executors: IExecutors,
    private readonly infra: InfrastructureSpec,
    config: {
      imageUri?: string;
      stationName?: string;
    } = {},
  ) {
    super(pm, executors);
    logger.debug(
      'FLEET',
      `GceCosProvider infra: ${JSON.stringify(infra, null, 2)}`,
    );
    this.projectId = projectId;
    this.zone = zone;
    this.instanceName = instanceName;
    this.repoRoot = repoRoot;
    this.ssh = ssh;
    this.imageUri =
      config.imageUri ||
      'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';
    this.stationName = config.stationName || instanceName;
  }

  /**
   * Path resolution (Backend specific root)
   */
  override resolveWorkDir(workspaceName: string): string {
    return path.join(this.resolveWorkspacesRoot(), workspaceName);
  }

  override resolveWorkspacesRoot(): string {
    return `${ORBIT_ROOT}/workspaces`;
  }

  override resolveBundlePath(): string {
    return BUNDLE_PATH;
  }

  override resolveWorkerPath(): string {
    return STATION_BUNDLE_PATH;
  }

  override resolveProjectConfigDir(): string {
    return `${ORBIT_ROOT}/project-configs`;
  }

  override resolveGlobalConfigDir(): string {
    return CONFIG_DIR;
  }

  override async syncGlobalConfig(): Promise<number> {
    const targetDir = this.resolveGlobalConfigDir();

    // 1. Sync settings.json (Auth methods, colors, etc.)
    if (fs.existsSync(GLOBAL_SETTINGS_FILE)) {
      await this.sync(GLOBAL_SETTINGS_FILE, targetDir, {
        sudo: true,
        quiet: true,
      });
    }

    // 2. Sync google_accounts.json (Secure credentials)
    if (fs.existsSync(GLOBAL_ACCOUNTS_FILE)) {
      await this.sync(GLOBAL_ACCOUNTS_FILE, targetDir, {
        sudo: true,
        quiet: true,
      });
    }

    // 3. Sync GitHub CLI config (hosts.yml)
    if (fs.existsSync(GLOBAL_GH_CONFIG)) {
      const ghTargetDir = `${ORBIT_ROOT}/gemini-cli-config/.config/gh`;
      await this.exec(`sudo mkdir -p ${ghTargetDir}`, { quiet: true });
      await this.sync(GLOBAL_GH_CONFIG, ghTargetDir, {
        sudo: true,
        quiet: true,
      });
    }

    return 0;
  }

  override resolvePolicyPath(_repoRoot: string): string {
    return `${ORBIT_ROOT}/project-configs/policies/workspace-policy.toml`;
  }

  override resolveMirrorPath(): string {
    return MAIN_REPO_PATH;
  }

  injectState(state: InfrastructureState): void {
    if (state.publicIp) {
      this.ssh.setOverrideHost(state.publicIp);
    }
  }

  async prepareMissionWorkspace(
    mCtx: MissionContext,
    infra: InfrastructureSpec,
  ): Promise<void> {
    const provisioner = new RemoteProvisioner(this.projectCtx, this);
    await provisioner.prepareMissionWorkspace(mCtx, infra);
  }

  async ensureReady(): Promise<number> {
    const repoCheck = await this.getExecOutput(
      `ls -d ${this.resolveMirrorPath()}/.git`,
      {
        quiet: true,
      },
    );
    if (repoCheck.status !== 0) {
      logger.warn(
        'SETUP',
        '   - Main repo mirror missing on host. This may cause mission delays.',
      );
    }

    try {
      const remote = this.ssh.getMagicRemote();
      logger.info(
        `   - Verifying health check (${this.stationName}) at ${remote}...`,
      );

      // Wait for persistent disk to be mounted (ADR 0016)
      if (this.isPersistent) {
        let mounted = false;
        for (let i = 0; i < 30; i++) {
          const mountCheck = await this.getExecOutput(
            `grep -q "${ORBIT_ROOT}" /proc/mounts`,
            { quiet: true },
          );
          if (mountCheck.status === 0) {
            mounted = true;
            break;
          }
          process.stdout.write('.');
          await new Promise((r) => setTimeout(r, 2000));
        }

        if (!mounted) {
          throw new Error(
            `Data disk ${ORBIT_ROOT} failed to mount. Check the instance startup-script logs via 'gcloud compute instances get-serial-port-output ${this.instanceName}'.`,
          );
        }
      }

      // Ensure critical directories exist with correct permissions for multi-tenant isolation
      const criticalDirs = [
        BUNDLE_PATH,
        this.resolveWorkspacesRoot(),
        this.resolveMirrorPath(),
        this.resolveProjectConfigDir(),
        this.resolveGlobalConfigDir(),
        `${ORBIT_ROOT}/tmp`,
      ];
      const setupRes = await this.getExecOutput(
        `sudo mkdir -p ${criticalDirs.join(' ')} && sudo chown -R 1000:1000 ${ORBIT_ROOT} && sudo chmod -R 2775 ${ORBIT_ROOT}`,
        { quiet: true },
      );
      if (setupRes.status !== 0) {
        throw new Error(
          `Failed to initialize ${ORBIT_ROOT} (exit ${setupRes.status}): ${setupRes.stdout} ${setupRes.stderr}`,
        );
      }

      // Note: syncIfChanged now uses SSHManager retries internally
      const syncStatus = await this.syncIfChanged(
        `${LOCAL_BUNDLE_PATH}/`,
        BUNDLE_PATH,
        {
          delete: true,
          sudo: true,
          quiet: true,
        },
      );

      if (syncStatus !== 0) {
        throw new Error(
          `Failed to synchronize extension bundle to remote host (exit code ${syncStatus}).`,
        );
      }

      // Polling Loop: Wait for supervisor to be running
      let check: { exists: boolean; running: boolean } | null = null;
      let lastErr: any = null;

      for (let i = 0; i < 10; i++) {
        try {
          check = await this.getCapsuleStatus(this.instanceName);
          break;
        } catch (err: any) {
          lastErr = err;
          // Only retry on connectivity errors (SSH failures)
          if (
            err instanceof ConnectivityError ||
            err.message?.includes('exit code 255')
          ) {
            process.stdout.write('.');
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          throw err;
        }
      }

      if (!check) {
        throw lastErr || new Error('Failed to establish SSH connection.');
      }

      if (!check.exists || !check.running) {
        logger.info(
          '   - Supervisor capsule missing or stopped. Refreshing...',
        );
        const innerCmd = `ln -sfn /mnt/disks/data /home/node/.orbit && while true; do sleep 1000; done`;
        const refreshCmd = `
            sudo docker pull ${this.imageUri}
            sudo docker rm -f ${this.instanceName} 2>/dev/null || true
            sudo docker run -d --name ${this.instanceName} --restart always --user root \\
              -v /mnt/disks/data:/mnt/disks/data:rw \\
              -v /mnt/disks/data/gemini-cli-config/.gemini:/home/node/.gemini:rw \\
              ${this.imageUri} /bin/bash -c "${innerCmd}"
          `;
        await this.exec(refreshCmd, { quiet: true });
      }

      logger.info(`📡 Acquiring station signal (${this.stationName})...`);
      for (let i = 0; i < 30; i++) {
        const status = await this.getCapsuleStatus(this.instanceName);
        if (status.running) {
          if (i > 0) process.stdout.write('\n');
          logger.info(`🎯 Signal lock established.`);
          return 0;
        }
        process.stdout.write('.');
        await new Promise((r) => setTimeout(r, 2000));
      }
      process.stdout.write('\n');
    } catch (err: any) {
      console.error(`\n❌ Readiness Error: ${err.message}`);
      return 255;
    }

    logger.error(`❌ Station "${this.stationName}" failed to respond.`);
    return 1;
  }

  override createNodeCommand(scriptPath: string, args: string[] = []): Command {
    return this.executors.node.createRemote(scriptPath, args);
  }

  getRunCommand(): string {
    return 'NOT_IMPLEMENTED_USE_SSH_MANAGER';
  }

  async exec(
    command: string | Command,
    options: ExecOptions = {},
  ): Promise<number> {
    const res = await this.getExecOutput(command, options);
    return res.status;
  }

  override resolveIsolationId(mCtx: MissionContext): string {
    return mCtx.containerName;
  }

  async getExecOutput(
    command: string | Command,
    options: ExecOptions = {},
  ): Promise<{ status: number; stdout: string; stderr: string }> {
    const cmdObj =
      typeof command === 'string' ? { bin: command, args: [] } : command;

    const mergedOptions = {
      ...options,
      ...(cmdObj.options || {}),
    };

    let remoteCmd: RemoteCommand;

    if (typeof command === 'string') {
      // For raw strings, we use sh -c for maximum portability
      remoteCmd = {
        bin: '/bin/sh',
        args: ['-c', command],
        env: { ...(mergedOptions.env || {}) },
      };
    } else {
      // For Command objects, pass through to avoid double-nesting
      remoteCmd = {
        bin: cmdObj.bin,
        args: cmdObj.args,
        env: { ...(mergedOptions.env || {}) },
      };
    }

    if (mergedOptions.cwd) remoteCmd.cwd = mergedOptions.cwd;
    if (mergedOptions.user) remoteCmd.user = mergedOptions.user;

    if (mergedOptions.isolationId) {
      const capsulePath =
        '/usr/local/share/npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
      remoteCmd.env!.PATH = capsulePath;
      remoteCmd.env!.COLORTERM = 'truecolor';
      remoteCmd.env!.FORCE_COLOR = '3';
      remoteCmd.env!.TERM = 'xterm-256color';
      remoteCmd.env!.TERM_PROGRAM = process.env.TERM_PROGRAM || 'iTerm.app';

      // ADR: Propagate sensitive credentials into the exec environment
      if (mergedOptions.sensitiveEnv) {
        Object.assign(remoteCmd.env!, mergedOptions.sensitiveEnv);
      }

      return this.ssh.runDockerExec(
        mergedOptions.isolationId,
        remoteCmd,
        mergedOptions,
      );
    }

    return this.ssh.runHostCommand(remoteCmd, mergedOptions);
  }

  async sync(
    localPath: string,
    remotePath: string,
    options: SyncOptions = {},
  ): Promise<number> {
    return this.ssh.syncPath(localPath, remotePath, options);
  }

  async syncIfChanged(
    localPath: string,
    remotePath: string,
    options: SyncOptions = {},
  ): Promise<number> {
    return this.ssh.syncPathIfChanged(localPath, remotePath, options);
  }

  async getStatus(): Promise<OrbitStatus> {
    const res = this.pm.runSync(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'describe',
        this.instanceName,
        '--project',
        this.projectId,
        '--zone',
        this.zone,
        '--quiet',
        '--format',
        'json(name,status,networkInterfaces[0].networkIP,networkInterfaces[0].accessConfigs[0].natIP)',
      ],
      {
        quiet: true,
        env: { ...process.env, CLOUDSDK_CORE_VERBOSITY: 'error' },
      },
    );

    if (res.status !== 0) {
      return { name: this.instanceName, status: 'NOT_FOUND' };
    }

    const data = JSON.parse(res.stdout.toString());
    let status = data.status;
    if (status === 'TERMINATED') status = 'HIBERNATING';

    return {
      name: data.name,
      status,
      internalIp: data.networkInterfaces[0].networkIP,
      externalIp: data.networkInterfaces[0].accessConfigs?.[0]?.natIP,
    };
  }

  async start(): Promise<number> {
    const res = this.pm.runSync(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'start',
        this.instanceName,
        '--project',
        this.projectId,
        '--zone',
        this.zone,
        '--quiet',
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, CLOUDSDK_CORE_VERBOSITY: 'error' },
      },
    );
    return res.status;
  }

  async stop(): Promise<number> {
    const res = this.pm.runSync(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'stop',
        this.instanceName,
        '--project',
        this.projectId,
        '--zone',
        this.zone,
        '--quiet',
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, CLOUDSDK_CORE_VERBOSITY: 'error' },
      },
    );
    return res.status;
  }

  async getCapsuleStatus(
    name: string,
  ): Promise<{ running: boolean; exists: boolean }> {
    const res = await this.getExecOutput(
      `sudo docker inspect -f '{{.State.Running}}' ${name}`,
      { quiet: true },
    );
    if (res.status === 255) {
      throw new ConnectivityError(res.stderr || 'SSH connection failed (255)');
    }
    if (res.status !== 0) return { running: false, exists: false };
    return { running: res.stdout.trim() === 'true', exists: true };
  }

  async getCapsuleStats(name: string): Promise<string> {
    const res = await this.getExecOutput(
      `sudo docker stats ${name} --no-stream --format '{{.CPUPerc}} / {{.MemUsage}}'`,
      { quiet: true },
    );
    return res.stdout.trim();
  }

  async getCapsuleIdleTime(): Promise<number> {
    return 0;
  }

  async attach(identifier: string): Promise<number> {
    // If identifier already includes the repo slug, don't double-prefix it
    const cleanId = identifier.startsWith(`${this.projectCtx.repoName}-`)
      ? identifier.replace(`${this.projectCtx.repoName}-`, '')
      : identifier.startsWith(`${this.projectCtx.repoName}/`)
        ? identifier.replace(`${this.projectCtx.repoName}/`, '')
        : identifier;

    const { repoSlug, idSlug, action, containerName } = resolveMissionContext(
      cleanId,
      this.projectCtx.repoName,
      this.pm,
    );
    const sessionName = this.resolveSessionName(repoSlug, idSlug, action);

    return this.ssh.attachToTmux(containerName, sessionName);
  }

  async runCapsule(config: CapsuleConfig): Promise<number> {
    const cmd = this.executors.docker.run(config.image, config.command, {
      ...config,
      label: 'orbit-mission=true',
    });
    return this.exec(cmd);
  }

  async stopCapsule(name: string): Promise<number> {
    return this.exec(this.executors.docker.stop(name));
  }

  async removeCapsule(name: string): Promise<number> {
    const res = await this.exec(this.executors.docker.remove(name));
    // Also remove any associated secret for this capsule
    await this.removeSecret(name);
    return res;
  }

  async jettisonMission(identifier: string, action?: string): Promise<number> {
    const { repoSlug, idSlug } = resolveMissionContext(
      identifier,
      this.projectCtx.repoName,
      this.pm,
    );

    if (action) {
      // 1. Surgical Action Cleanup: Remove specific Docker container and its secret
      const containerName = this.resolveContainerName(repoSlug, idSlug, action);
      return await this.removeCapsule(containerName);
    }

    // 2. Full Mission Cleanup: Remove all containers matching repoSlug-idSlug-*
    const namePrefix = `${repoSlug}-${idSlug}`;
    const cleanupCmd = `sudo docker ps -a --format '{{.Names}}' | grep '^${namePrefix}' | xargs -r sudo docker rm -f`;
    const res = await this.exec(cleanupCmd, { quiet: true });

    // Bulk Secret Cleanup for this mission
    const secretPattern = this.resolveSecretPath(`${namePrefix}-*`);
    await this.exec(`sudo rm -f ${secretPattern}`, { quiet: true });

    return res;
  }

  async splashdown(
    options: {
      all?: boolean;
      clearSecrets?: boolean;
    } = {},
  ): Promise<number> {
    const { clearSecrets } = options;

    // 1. Remove all mission capsules (removeCapsule also cleans up individual secrets)
    const capsules = await this.listCapsules();
    for (const capsule of capsules) {
      await this.removeCapsule(capsule);
    }

    // 2. Clear ALL mission secrets from RAM-disk if requested (Nuclear option)
    if (clearSecrets) {
      await this.exec('sudo rm -f /dev/shm/.orbit-env-*', { quiet: true });
    }

    return 0;
  }

  async removeSecret(secretId: string): Promise<void> {
    const secretPath = this.resolveSecretPath(secretId);
    await this.exec(`sudo rm -f ${secretPath}`, { quiet: true });
  }

  async capturePane(capsuleName: string): Promise<string> {
    const res = await this.getExecOutput(
      `sudo docker exec ${capsuleName} tmux capture-pane -pt default`,
      { quiet: true },
    );
    return res.stdout;
  }

  async listStations(): Promise<number> {
    const res = this.pm.runSync(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'list',
        '--project',
        this.projectId,
        '--filter',
        'labels.orbit-managed=true',
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, CLOUDSDK_CORE_VERBOSITY: 'error' },
      },
    );
    return res.status;
  }

  async destroy(): Promise<number> {
    const res = this.pm.runSync(
      'gcloud',
      [
        '--verbosity=error',
        'compute',
        'instances',
        'delete',
        this.instanceName,
        '--project',
        this.projectId,
        '--zone',
        this.zone,
        '--quiet',
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, CLOUDSDK_CORE_VERBOSITY: 'error' },
      },
    );
    return res.status;
  }

  async listCapsules(): Promise<string[]> {
    try {
      const res = await this.getExecOutput(
        "sudo docker ps --format '{{.Names}}' --filter 'label=orbit-mission=true'",
        { quiet: true },
      );
      if (res.status !== 0) {
        // grep returns 1 if no matches found, which is fine
        if (res.status === 1 && !res.stderr) return [];

        throw new Error(
          `Failed to list capsules: ${res.stderr || 'Connection failed'} (exit ${res.status})`,
        );
      }
      return res.stdout.trim().split('\n').filter(Boolean);
    } catch (e: any) {
      logger.debug('FLEET', `Error in listCapsules: ${e.message}`);
      throw e;
    }
  }

  async provisionMirror(remoteUrl: string): Promise<number> {
    const mirrorPath = '/mnt/disks/data/main';
    const check = await this.exec(`ls -d ${mirrorPath}/.git`, { quiet: true });
    if (check === 0) return 0;

    const cmds = [
      `sudo mkdir -p /mnt/disks/data/tmp`,
      `sudo chmod -R 777 /mnt/disks/data`,
      `sudo TMPDIR=/mnt/disks/data/tmp git clone --mirror ${remoteUrl} ${mirrorPath}`,
      `sudo chmod -R 777 ${mirrorPath}`,
    ];

    for (const cmd of cmds) {
      const isClone = cmd.includes('git clone');
      const res = await this.exec(cmd, {
        quiet: !isClone,
        stream: isClone, // Stream git clone output to show progress
      });
      if (res !== 0) return res;
    }
    return 0;
  }

  async stationShell(): Promise<number> {
    return this.exec('/bin/bash', { interactive: true });
  }
  async missionShell(capsuleName: string): Promise<number> {
    return this.exec('/bin/bash', {
      isolationId: capsuleName,
      interactive: true,
      user: 'node',
    });
  }

  getStationReceipt(): StationReceipt {
    return {
      name: this.stationName,
      instanceName: this.instanceName,
      type: 'gce',
      projectId: this.projectId,
      zone: this.zone,
      repo: this.projectCtx.repoName,
      upstreamUrl: this.infra.upstreamUrl,
      backendType: this.infra.backendType as any,
      schematic: this.infra.schematic,
      dnsSuffix: this.infra.dnsSuffix,
      userSuffix: this.infra.userSuffix,
      lastSeen: new Date().toISOString(),
    };
  }

  protected override async resolveLegacyCapsuleState(
    name: string,
  ): Promise<CapsuleInfo['state']> {
    const tmuxCmd = {
      bin: 'tmux',
      args: ['list-sessions', '-F', '#S'],
    };

    const tmuxRes = await this.getExecOutput(tmuxCmd, {
      isolationId: name,
      quiet: true,
    });

    if (tmuxRes.status === 0 && tmuxRes.stdout.trim()) {
      const paneOutput = await this.capturePane(name);
      const lines = paneOutput.trim().split('\n');
      const lastLine = lines[lines.length - 1] || '';
      const lastTwoLines = lines.slice(-2).join(' ');

      const isWaiting =
        lastLine.includes(' > ') ||
        lastLine.trim().endsWith('>') ||
        lastTwoLines.includes('(y/n)') ||
        lastLine.trim().endsWith('?') ||
        (lastLine.includes('node@') && lastLine.includes('$'));

      return isWaiting ? 'WAITING' : 'THINKING';
    }

    return 'IDLE';
  }
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ORBIT_STATE_PATH } from '../core/Constants.js';
import { type IProcessManager } from '../core/interfaces.js';
import { ProcessManager } from '../core/ProcessManager.js';
import { GitExecutor } from '../core/executors/GitExecutor.js';
import { NodeExecutor } from '../core/executors/NodeExecutor.js';
import { getRepoConfig } from '../core/ConfigManager.js';
import { runReviewPlaybook } from '../playbooks/review.js';
import { runFixPlaybook } from '../playbooks/fix.js';
import { runReadyPlaybook } from '../playbooks/ready.js';
import { SessionManager } from '../utils/SessionManager.js';
import { TempManager } from '../utils/TempManager.js';

import { type Command } from '../core/executors/types.js';
import { type MissionManifest } from '../core/types.js';

/**
 * StationSupervisor: Remote host management layer.
 * Responsible for workspace setup and mission spawning.
 */
export class StationSupervisor {
  constructor(
    private readonly dirname: string,
    private readonly pm: IProcessManager = new ProcessManager(),
  ) {}

  /**
   * Universal Entrypoint: Orchestrates init, hooks, and mission launch.
   * This is the single RPC call from the SDK to start a mission.
   */
  async start(manifest: MissionManifest) {
    await this.initGit(manifest);
    await this.setupHooks(manifest);

    return this.runMission(manifest);
  }

  /**
   * Ensures the workspace is configured with the mission-control hooks.
   */
  async setupHooks(manifest: MissionManifest) {
    const targetDir = manifest.workDir;
    const orbitDir = path.join(targetDir, '.gemini/orbit');
    if (!fs.existsSync(orbitDir)) {
      fs.mkdirSync(orbitDir, { recursive: true });
    }

    // Ensure state file is accessible/writable
    const stateFile = path.join(targetDir, ORBIT_STATE_PATH);
    if (!fs.existsSync(stateFile)) {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      fs.writeFileSync(
        stateFile,
        JSON.stringify({ status: 'IDLE', timestamp: new Date().toISOString() }),
      );
    }

    // Inject hooks into settings.json for Gemini CLI
    const settingsFile = path.join(targetDir, '.gemini/settings.json');
    const hooksScript = path.join(this.dirname, 'hooks.js');

    const orbitHooks = {
      BeforeAgent: [{ type: 'command', command: `node ${hooksScript}` }],
      AfterAgent: [{ type: 'command', command: `node ${hooksScript}` }],
      BeforeTool: [{ type: 'command', command: `node ${hooksScript}` }],
      Notification: [{ type: 'command', command: `node ${hooksScript}` }],
    };

    let settings: any = {};
    if (fs.existsSync(settingsFile)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      } catch {}
    }

    settings.hooks = { ...(settings.hooks || {}), ...orbitHooks };
    settings.hooksConfig = { ...(settings.hooksConfig || {}), enabled: true };

    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));

    return 0;
  }

  /**
   * Performs Git initialization using GitExecutor.
   */
  async initGit(manifest: MissionManifest) {
    const {
      workDir: targetDir,
      upstreamUrl,
      branchName: branch,
      mirrorPath,
    } = manifest;
    const run = (cmd: Command) => {
      const res = this.pm.runSync(cmd.bin, cmd.args, cmd.options);
      if (res.status !== 0) {
        throw new Error(
          `Git command failed: ${cmd.bin} ${cmd.args.join(' ')}\n` +
            `Status: ${res.status}\n` +
            `STDOUT: ${res.stdout}\n` +
            `STDERR: ${res.stderr}`,
        );
      }
      return res;
    };

    // Strict local .git detection.
    const gitPath = path.join(targetDir, '.git');
    const isInitialized = fs.existsSync(gitPath);

    if (!isInitialized) {
      console.log(`📦 Initializing Git workspace at ${targetDir}...`);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      run(GitExecutor.init(targetDir));
      run(GitExecutor.remoteAdd(targetDir, 'origin', upstreamUrl));

      if (mirrorPath && fs.existsSync(path.join(mirrorPath, 'config'))) {
        const alternatesPath = path.join(
          targetDir,
          '.git/objects/info/alternates',
        );
        const mirrorObjects = path.join(mirrorPath, 'objects');
        fs.mkdirSync(path.dirname(alternatesPath), { recursive: true });
        fs.writeFileSync(alternatesPath, mirrorObjects);
      }
    } else {
      console.log(`✅ Git workspace already initialized at ${targetDir}`);
    }

    // --- Unified Branch Resolution ---

    // 0. Check if we are already on the correct branch to avoid conflicts
    const currentBranchCmd: Command = {
      bin: 'git',
      args: ['rev-parse', '--abbrev-ref', 'HEAD'],
      options: { cwd: targetDir, quiet: true },
    };
    const currentBranchRes = this.pm.runSync(
      currentBranchCmd.bin,
      currentBranchCmd.args,
      currentBranchCmd.options,
    );

    const currentBranch =
      currentBranchRes.status === 0 ? currentBranchRes.stdout.trim() : '';
    if (currentBranch === branch) {
      console.log(`   ✨ Already on branch '${branch}'. Rolling with it...`);
      return 0;
    }

    // Try to fetch the branch from origin
    console.log(`   - Attempting to fetch branch '${branch}' from origin...`);
    const fetchCmd = GitExecutor.fetch(targetDir, 'origin', branch);
    const fetchRes = this.pm.runSync(
      fetchCmd.bin,
      fetchCmd.args,
      fetchCmd.options,
    );

    if (fetchRes.status !== 0) {
      console.log(`   ⚠️  Branch '${branch}' not found on origin.`);
    }

    // 1. Check if branch already exists locally
    const checkLocalCmd: Command = {
      bin: 'git',
      args: ['rev-parse', '--verify', branch],
      options: { cwd: targetDir, quiet: true },
    };
    const localRes = this.pm.runSync(
      checkLocalCmd.bin,
      checkLocalCmd.args,
      checkLocalCmd.options,
    );

    if (localRes.status === 0) {
      console.log(`   - Branch '${branch}' exists locally. Checking out...`);
      run(GitExecutor.checkout(targetDir, branch));
    } else {
      // 2. Try to checkout from origin/branch if we successfully fetched it
      const remoteRef = `origin/${branch}`;
      const checkRemoteCmd: Command = {
        bin: 'git',
        args: ['rev-parse', '--verify', remoteRef],
        options: { cwd: targetDir, quiet: true },
      };
      const remoteRes = this.pm.runSync(
        checkRemoteCmd.bin,
        checkRemoteCmd.args,
        checkRemoteCmd.options,
      );

      if (remoteRes.status === 0) {
        console.log(`   - Creating branch '${branch}' from ${remoteRef}...`);
        run({
          bin: 'git',
          args: ['checkout', '-b', branch, remoteRef],
          options: { cwd: targetDir },
        });
      } else {
        // 3. Fallback: Create new branch from current HEAD
        console.log(`   - Creating new branch '${branch}' from HEAD...`);
        run({
          bin: 'git',
          args: ['checkout', '-b', branch],
          options: { cwd: targetDir },
        });
      }
    }

    console.log(`✅ Workspace ready on branch: ${branch}`);
    return 0;
  }

  /**
   * Executes a mission playbook directly (called by entrypoint).
   */
  async runPlaybook(manifest: MissionManifest) {
    const {
      identifier: prNumberOrIssue,
      action,
      workDir,
      policyPath,
      sessionName,
    } = manifest;
    const targetDir = path.resolve(workDir);

    // Resolve absolute path of gemini
    const geminiBin = 'gemini';

    const config = getRepoConfig();
    const tempManager = new TempManager(config);
    const sessionId =
      SessionManager.getSessionIdFromEnv() ||
      SessionManager.generateMissionId(prNumberOrIssue, action);
    const logDir = tempManager.getDir(sessionId);

    // Policy Resolution
    let resolvedPolicyPath = policyPath;
    const projectLocalPolicy = path.join(
      targetDir,
      `.gemini/orbit/${action}.policy.toml`,
    );
    if (fs.existsSync(projectLocalPolicy)) {
      resolvedPolicyPath = projectLocalPolicy;
    }

    const missionHeader = `🚀 Mission: ${prNumberOrIssue} | Action: ${action}`;
    console.log(`\n${missionHeader}`);
    console.log(`📂 Log Directory: ${logDir}`);
    console.log(`🛡️  Using Policy: ${resolvedPolicyPath}`);

    // Dispatch to Playbook
    switch (action) {
      case 'chat': {
        // Chat mode: drop into interactive Gemini
        const missionId = prNumberOrIssue;
        console.log(`\n💬 Entering Mission Chat: ${sessionName || missionId}`);

        // ADR: Smarter resumption logic.
        const sessionsDir = path.join(os.homedir(), '.gemini/sessions');
        const hasSessions =
          fs.existsSync(sessionsDir) && fs.readdirSync(sessionsDir).length > 0;

        const cmd = hasSessions
          ? `${geminiBin} --resume latest`
          : `${geminiBin}`;

        const res = this.pm.runSync('sh', ['-c', cmd], {
          stdio: 'inherit',
          cwd: targetDir,
        });
        return res.status;
      }

      case 'review':
        return runReviewPlaybook(
          prNumberOrIssue,
          targetDir,
          resolvedPolicyPath,
          geminiBin,
          logDir,
          missionHeader,
        );

      case 'fix':
        return runFixPlaybook(
          prNumberOrIssue,
          targetDir,
          resolvedPolicyPath,
          geminiBin,
          logDir,
          missionHeader,
        );

      case 'ready':
        return runReadyPlaybook(
          prNumberOrIssue,
          targetDir,
          resolvedPolicyPath,
          geminiBin,
          logDir,
          missionHeader,
        );

      case 'implement': {
        const { runImplementPlaybook } =
          await import('../playbooks/implement.js');
        return runImplementPlaybook(
          prNumberOrIssue,
          targetDir,
          resolvedPolicyPath,
          geminiBin,
          logDir,
          missionHeader,
        );
      }
      default:
        console.error(`❌ Unknown playbook action: ${action}`);
        return 1;
    }
  }

  /**
   * Spawns a mission using the unified Tmux wrapper.
   */
  async runMission(manifest: MissionManifest) {
    const { workDir, sessionName: sName } = manifest;
    const targetDir = path.resolve(workDir);
    const entrypointPath = path.join(this.dirname, 'entrypoint.js');

    // Build the inner node command
    const nodeCmd = NodeExecutor.create(entrypointPath, []);

    // ADR 0018: Inject manifest into the tmux session environment string
    const manifestJson = JSON.stringify(manifest);
    const envPrefix = `GCLI_ORBIT_MANIFEST='${manifestJson.replace(/'/g, "'\\''")}' `;

    // Wrap it in Tmux for persistence
    const tip =
      'printf "\\n   \\x1b[38;5;244m💡 Tip: Press \\x1b[38;5;39mCtrl-b d\\x1b[38;5;244m to detach and keep mission running.\\x1b[0m\\n\\n"';

    const tmuxCmd = {
      bin: 'tmux',
      args: [
        'new-session',
        '-d',
        '-A',
        '-s',
        sName,
        `${tip}; ${envPrefix}${nodeCmd.bin} ${nodeCmd.args.join(' ')} || exec zsh`,
      ],
      options: { cwd: targetDir },
    };

    // Launch!
    const res = this.pm.runSync(tmuxCmd.bin, tmuxCmd.args, tmuxCmd.options);

    // Apply Stealth UI Styles and Environment to the session explicitly
    const styleCmds = [
      ['set-option', '-t', sName, 'status', 'on'],
      ['set-option', '-t', sName, 'status-position', 'top'],
      ['set-option', '-t', sName, 'status-style', 'bg=colour235,fg=colour244'],
      [
        'set-option',
        '-t',
        sName,
        'status-left',
        '#[fg=colour39,bold] 🛰️  ORBIT #[fg=colour244]┃ ',
      ],
      ['set-option', '-t', sName, 'status-right', '#[fg=colour244] #H '],
      [
        'set-option',
        '-t',
        sName,
        'window-status-current-format',
        '#[fg=colour45,bold] #S ',
      ],
      // Explicitly inject manifest into the tmux session environment so all shells see it
      ['set-environment', '-t', sName, 'GCLI_ORBIT_MANIFEST', manifestJson],
    ];

    for (const args of styleCmds) {
      this.pm.runSync('tmux', args, { quiet: true });
    }

    return res.status;
  }
}

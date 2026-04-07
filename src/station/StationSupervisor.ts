/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { ORBIT_STATE_PATH } from '../core/Constants.js';
import {
  type IProcessManager,
  type ITmuxExecutor,
} from '../core/interfaces.js';
import { ProcessManager } from '../core/ProcessManager.js';
import { TmuxExecutor } from '../core/executors/TmuxExecutor.js';
import { GitExecutor } from '../core/executors/GitExecutor.js';
import { NodeExecutor } from '../core/executors/NodeExecutor.js';
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
    private readonly tmux: ITmuxExecutor = new TmuxExecutor(pm),
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
   * Initializes the mission workspace on the host.
   */
  async initGit(manifest: MissionManifest) {
    const { workDir, upstreamUrl, branchName: branch, mirrorPath } = manifest;
    const targetDir = path.resolve(workDir);

    console.log(
      `[DEBUG] initGit starting. upstreamUrl: ${upstreamUrl}, targetDir: ${targetDir}`,
    );

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

    const r = path.join(targetDir, '.git');
    if (fs.existsSync(r)) {
      console.log(`✅ Git workspace already initialized at ${targetDir}`);

      // Ensure remote is set up correctly (in case of partial initialization)
      const remoteCheck = this.pm.runSync(
        'git',
        ['-C', targetDir, 'remote', 'get-url', 'origin'],
        { quiet: true },
      );
      const currentUrl = remoteCheck.stdout.toString().trim();
      if (
        remoteCheck.status !== 0 ||
        !currentUrl ||
        currentUrl === 'undefined'
      ) {
        console.log('   - Setting up origin remote...');
        // Remove potentially broken remote first
        this.pm.runSync(
          'git',
          ['-C', targetDir, 'remote', 'remove', 'origin'],
          { quiet: true },
        );
        run(GitExecutor.remoteAdd(targetDir, 'origin', upstreamUrl));
      }
    } else {
      console.log(`📦 Initializing Git workspace at ${targetDir}...`);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      run(GitExecutor.init(targetDir));

      if (!upstreamUrl) {
        throw new Error(
          `❌ Cannot initialize workspace: upstreamUrl is required but missing from manifest.`,
        );
      }
      run(GitExecutor.remoteAdd(targetDir, 'origin', upstreamUrl));

      if (mirrorPath && fs.existsSync(path.join(mirrorPath, 'config'))) {
        const alternates = path.join(targetDir, '.git/objects/info/alternates');
        const objects = path.join(mirrorPath, 'objects');
        fs.mkdirSync(path.dirname(alternates), { recursive: true });
        fs.writeFileSync(alternates, objects);
      }
    }

    const currentBranchRes = this.pm.runSync(
      'git',
      GitExecutor.revParse(targetDir, ['--abbrev-ref', 'HEAD']).args,
      {
        ...GitExecutor.revParse(targetDir, ['--abbrev-ref', 'HEAD']).options,
        quiet: true,
      },
    );

    if (
      currentBranchRes.status === 0 &&
      currentBranchRes.stdout.trim() === branch
    ) {
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
    const checkLocalCmd = GitExecutor.verify(targetDir, branch);
    const localRes = this.pm.runSync(checkLocalCmd.bin, checkLocalCmd.args, {
      ...checkLocalCmd.options,
      quiet: true,
    });

    if (localRes.status === 0) {
      console.log(`   - Branch '${branch}' exists locally. Checking out...`);
      run(GitExecutor.checkout(targetDir, branch));
    } else {
      // 2. Try to checkout from origin/branch if we successfully fetched it
      const remoteRef = `origin/${branch}`;
      const checkRemoteCmd = GitExecutor.verify(targetDir, remoteRef);
      const remoteRes = this.pm.runSync(
        checkRemoteCmd.bin,
        checkRemoteCmd.args,
        { ...checkRemoteCmd.options, quiet: true },
      );

      if (remoteRes.status === 0) {
        console.log(`   - Creating branch '${branch}' from ${remoteRef}...`);
        run(GitExecutor.checkoutNew(targetDir, branch, remoteRef));
      } else {
        // 3. Fallback: Create new branch from current HEAD
        console.log(`   - Creating new branch '${branch}' from HEAD...`);
        run(GitExecutor.checkoutNew(targetDir, branch));
      }
    }

    console.log(`✅ Workspace ready on branch: ${branch}`);
    return 0;
  }

  /**
   * Provision session-specific state and hooks.
   */
  async setupHooks(manifest: MissionManifest) {
    const { workDir } = manifest;
    const targetDir = path.resolve(workDir);

    const orbitDir = path.join(targetDir, '.gemini/orbit');
    if (!fs.existsSync(orbitDir)) {
      fs.mkdirSync(orbitDir, { recursive: true });
    }

    const statePath = path.join(targetDir, ORBIT_STATE_PATH);
    if (!fs.existsSync(statePath)) {
      fs.writeFileSync(
        statePath,
        JSON.stringify(
          {
            status: 'INITIALIZING',
            mission: manifest.identifier,
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    }

    return 0;
  }

  /**
   * Spawns a mission using the unified Tmux wrapper.
   */
  async runMission(manifest: MissionManifest) {
    const { workDir, sessionName: sName } = manifest;
    const targetDir = path.resolve(workDir);
    const missionPath = path.join(this.dirname, 'mission.js');

    // ADR 0018: The Mission binary is our sole authority in the session
    const nodeCmd = NodeExecutor.create(missionPath, []);
    const innerCommand = `${nodeCmd.bin} ${nodeCmd.args.join(' ')}`;

    // Use the dedicated TmuxExecutor to build the session wrapper
    const tmuxCmd = this.tmux.wrapMission(sName, innerCommand, {
      cwd: targetDir,
      env: {
        GCLI_ORBIT_VERBOSE: manifest.verbose ? '1' : '0',
      },
    });
    // Launch!
    const res = this.pm.runSync(tmuxCmd.bin, tmuxCmd.args, tmuxCmd.options);
    if (res.status !== 0) {
      console.error(`❌ Failed to launch mission: tmux returned ${res.status}`);
      console.error(`STDOUT: ${res.stdout}`);
      console.error(`STDERR: ${res.stderr}`);
    }
    return res.status;
  }
}

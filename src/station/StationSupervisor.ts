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
  type IProcessResult,
} from '../core/interfaces.js';
import { GitExecutor } from '../core/executors/GitExecutor.js';
import { type MissionManifest } from '../core/types.js';
import { type Command } from '../core/executors/types.js';

export interface ITmuxExecutor {
  wrapMission(
    sessionName: string,
    command: string,
    options?: import('../core/interfaces.js').IRunOptions,
  ): import('../core/executors/types.js').Command;
}

export class StationSupervisor {
  constructor(
    private readonly baseDir: string,
    private readonly pm: IProcessManager,
    private readonly tmux: ITmuxExecutor,
  ) {}

  /**
   * Orchestrates the initialization and launch of a mission.
   */
  async start(manifest: MissionManifest): Promise<number> {
    try {
      // 1. Prepare Git workspace
      await this.initGit(manifest);

      // 2. Setup session hooks and status
      await this.setupHooks(manifest);

      // 3. Launch mission worker in tmux
      return await this.launchMission(manifest);
    } catch (err: any) {
      console.error(`❌ Station Failure: ${err.message}`);
      return 1;
    }
  }

  /**
   * Ensures the Git workspace exists and is on the correct branch.
   */
  async initGit(manifest: MissionManifest) {
    const { upstreamUrl, branchName: branch, workDir, mirrorPath } = manifest;
    const targetDir = path.resolve(workDir);

    console.log(
      `[DEBUG] initGit starting. upstreamUrl: ${upstreamUrl}, targetDir: ${targetDir}`,
    );

    const run = (cmd: Command) => {
      const options = {
        ...cmd.options,
        env: {
          ...cmd.options?.env,
          GIT_TERMINAL_PROMPT: '0', // Prevent hanging on credentials
          GIT_ASKPASS: 'true', // Disable askpass
        },
      };
      const res = this.pm.runSync(cmd.bin, cmd.args, options);
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

    // 1. Repo existence check
    const isRepoRes = this.pm.runSync(
      'git',
      GitExecutor.revParse(targetDir, ['--is-inside-work-tree']).args,
      {
        ...GitExecutor.revParse(targetDir, ['--is-inside-work-tree']).options,
        quiet: true,
      },
    );

    if (isRepoRes.status !== 0) {
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
    } else {
      console.log(`✅ Git workspace already initialized at ${targetDir}`);
      // Ensure origin remote exists and matches
      const remoteCheck = this.pm.runSync(
        'git',
        ['-C', targetDir, 'remote', 'get-url', 'origin'],
        { quiet: true },
      );
      if (remoteCheck.status !== 0) {
        console.log('   - Setting up origin remote...');
        run(GitExecutor.remoteAdd(targetDir, 'origin', upstreamUrl!));
      }
    }

    // 2. Branch management
    const currentBranchRes = this.pm.runSync(
      'git',
      GitExecutor.revParse(targetDir, ['--abbrev-ref', 'HEAD']).args,
      {
        ...GitExecutor.revParse(targetDir, ['--abbrev-ref', 'HEAD']).options,
        env: { GIT_TERMINAL_PROMPT: '0' },
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
    console.log(`   - Fetching branch '${branch}' from origin...`);
    const fetchCmd = GitExecutor.fetch(targetDir, 'origin', branch);
    const fetchRes = this.pm.runSync(fetchCmd.bin, fetchCmd.args, {
      ...fetchCmd.options,
      env: { ...fetchCmd.options?.env, GIT_TERMINAL_PROMPT: '0' },
    });
    if (fetchRes.status !== 0) {
      console.log(`   ⚠️  Branch '${branch}' fetch failed or not found.`);
      console.log(`      (Git: ${fetchRes.stderr.trim()})`);
    }

    // Verify local vs origin/remote existence
    const localRes = this.pm.runSync(
      'git',
      GitExecutor.verify(targetDir, branch).args,
      {
        ...GitExecutor.verify(targetDir, branch).options,
        env: { GIT_TERMINAL_PROMPT: '0' },
        quiet: true,
      },
    );

    if (localRes.status === 0) {
      console.log(`   - Branch '${branch}' exists locally. Checking out...`);
      run(GitExecutor.checkout(targetDir, branch));
    } else {
      const remoteRef = `origin/${branch}`;
      const remoteRes = this.pm.runSync(
        'git',
        GitExecutor.verify(targetDir, remoteRef).args,
        {
          ...GitExecutor.verify(targetDir, remoteRef).options,
          env: { GIT_TERMINAL_PROMPT: '0' },
          quiet: true,
        },
      );

      if (remoteRes.status === 0) {
        console.log(`   - Creating branch '${branch}' from ${remoteRef}...`);
        run(GitExecutor.checkoutNew(targetDir, branch, remoteRef));
      } else {
        console.log(
          `   - Branch '${branch}' not found anywhere. Creating fresh from HEAD...`,
        );
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
            updatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    }
  }

  /**
   * Spawns the mission worker inside a tmux session.
   */
  async launchMission(manifest: MissionManifest): Promise<number> {
    const { sessionName, workDir, bundleDir } = manifest;

    // ADR 0018: Use the bundleDir provided in the manifest (Resolved by ContextResolver)
    const workerScript = path.join(
      bundleDir || '/mnt/disks/data/bundle',
      'mission.js',
    );

    console.log(`🚀 Launching mission worker: ${sessionName}`);
    const cmd = this.tmux.wrapMission(sessionName, `node ${workerScript}`, {
      cwd: workDir,
    });

    // ADR 0017: Mission worker runs in a persistent tmux session.
    this.pm.runAsync(cmd.bin, cmd.args, cmd.options);

    return 0;
  }
}

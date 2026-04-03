/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import {
  type InfrastructureSpec,
  type ProjectContext,
} from '../core/Constants.js';
import { LogLevel } from '../core/Logger.js';
import {
  type OrbitObserver,
  type CIStatus,
  type MonitorCIOptions,
} from '../core/types.js';

export class CIManager {
  constructor(
    private readonly projectCtx: ProjectContext,
    private readonly infra: InfrastructureSpec,
    private readonly observer: OrbitObserver,
  ) {}

  /**
   * Monitor CI status for a branch.
   */
  async monitor(options: MonitorCIOptions): Promise<CIStatus> {
    const { branch, runId } = options;
    const targetBranch =
      branch ||
      execSync('git branch --show-current', { cwd: this.projectCtx.repoRoot })
        .toString()
        .trim();

    // Resolve full repo name (org/repo)
    let fullRepo: string;
    try {
      const remoteUrl = execSync('git remote get-url origin', {
        cwd: this.projectCtx.repoRoot,
      })
        .toString()
        .trim();
      fullRepo = remoteUrl
        .replace(/.*github\.com[\/:]/, '')
        .replace(/\.git$/, '')
        .trim();
    } catch (_e) {
      fullRepo = `google-gemini/${this.projectCtx.repoName}`;
    }

    this.observer.onLog?.(
      LogLevel.INFO,
      'CI',
      `🔍 Monitoring CI for ${fullRepo} branch ${targetBranch}...`,
    );

    let targetRunIds: string[] = [];
    if (runId) {
      targetRunIds = [runId];
    } else {
      const runListOutput = this.runGh(
        `run list --branch "${targetBranch}" --limit 5 --json databaseId,status`,
      );
      if (runListOutput) {
        const runs = JSON.parse(runListOutput);
        targetRunIds = runs.map((r: any) => String(r.databaseId));
      }
    }

    if (targetRunIds.length === 0) {
      return { runs: [], status: 'NOT_FOUND' };
    }

    const fileToTests = new Map<string, Set<string>>();
    let anyRunning = false;
    let anyFailed = false;

    for (const rid of targetRunIds) {
      const runOutput = this.runGh(
        `run view "${rid}" --json status,conclusion,jobs`,
      );
      if (!runOutput) continue;
      const run = JSON.parse(runOutput);

      if (run.status !== 'completed') anyRunning = true;
      if (run.conclusion === 'failure') anyFailed = true;

      if (run.jobs) {
        const failedJobs = run.jobs.filter(
          (j: any) => j.conclusion === 'failure',
        );
        for (const job of failedJobs) {
          const logs = this.runGh(
            `api repos/${fullRepo}/actions/jobs/${job.databaseId}/logs`,
          );
          if (logs) {
            const failures = logs
              .split('\n')
              .filter(
                (l) =>
                  l.includes('FAIL') || l.includes('ERROR') || l.includes('❌'),
              );
            failures.forEach((line) => {
              const category = line.includes('.test.')
                ? 'Test Failure'
                : 'Build/Lint Error';
              if (!fileToTests.has(category))
                fileToTests.set(category, new Set());
              fileToTests.get(category)!.add(line.trim());
            });
          }
        }
      }
    }

    let status: CIStatus['status'] = 'PASSED';
    if (anyRunning) status = 'PENDING';
    else if (anyFailed) status = 'FAILED';

    return {
      runs: targetRunIds,
      status,
      failures: fileToTests,
    };
  }

  private runGh(args: string): string | null {
    try {
      return execSync(`gh ${args}`, {
        stdio: ['ignore', 'pipe', 'ignore'],
        cwd: this.projectCtx.repoRoot,
      }).toString();
    } catch (_e) {
      return null;
    }
  }
}

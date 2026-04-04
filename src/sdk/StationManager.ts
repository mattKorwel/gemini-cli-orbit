/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  STATIONS_DIR,
  type ProjectContext,
  type InfrastructureSpec,
} from '../core/Constants.js';
import {
  loadJson,
  loadSettings,
  detectRepoName,
} from '../core/ConfigManager.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import { logger } from '../core/Logger.js';

export interface StationReceipt {
  name: string;
  instanceName: string;
  type: 'gce' | 'local-worktree';
  projectId: string;
  zone: string;
  repo: string;
  status?: string;
  backendType?: 'direct-internal' | 'external';
  schematic?: string;
  rootPath?: string;
  lastSeen: string;
}

export class StationManager {
  constructor() {
    if (!fs.existsSync(STATIONS_DIR)) {
      fs.mkdirSync(STATIONS_DIR, { recursive: true });
    }
  }

  saveReceipt(receipt: StationReceipt): void {
    const p = path.join(STATIONS_DIR, `${receipt.name}.json`);
    fs.writeFileSync(p, JSON.stringify(receipt, null, 2));
  }

  deleteReceipt(name: string): void {
    const p = path.join(STATIONS_DIR, `${name}.json`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  async listStations(
    options: { syncWithReality?: boolean | undefined } = {},
  ): Promise<StationReceipt[]> {
    const settings = loadSettings();
    const files = fs
      .readdirSync(STATIONS_DIR)
      .filter((f) => f.endsWith('.json'));

    const receipts: StationReceipt[] = [];
    const seenNames = new Set<string>();

    // 1. Load Hardware Receipts (GCE, etc.)
    for (const f of files) {
      const receipt = loadJson(path.join(STATIONS_DIR, f)) as StationReceipt;
      if (!receipt) continue;

      if (options.syncWithReality) {
        const statusRes = await this.fetchRealityStatus(receipt);
        if (statusRes === 'NOT_FOUND') {
          logger.info(
            'STATION',
            `🗑️  Pruning stale station record: ${receipt.name}`,
          );
          this.deleteReceipt(receipt.name);
          continue;
        }
        receipt.status = statusRes;
      }
      receipts.push(receipt);
      seenNames.add(receipt.name);
    }

    // 2. Discover Local Repos (from settings.json)
    // Every repo entry in settings is effectively a local-worktree station base
    Object.keys(settings.repos).forEach((repoName) => {
      const stationName = `local-${repoName}`;
      if (!seenNames.has(stationName)) {
        receipts.push({
          name: stationName,
          instanceName: stationName,
          type: 'local-worktree',
          projectId: 'local',
          zone: 'localhost',
          repo: repoName,
          lastSeen: new Date().toISOString(),
        });
      }
    });

    return receipts;
  }

  async getMissions(receipt: StationReceipt): Promise<string[]> {
    const repoRoot = process.cwd();
    const projectCtx: ProjectContext = {
      repoRoot,
      repoName: receipt.repo || detectRepoName(repoRoot),
    };
    const infra: InfrastructureSpec = {
      projectId: receipt.projectId,
      zone: receipt.zone,
      instanceName: receipt.instanceName || receipt.name,
      providerType: receipt.type,
      backendType: receipt.backendType,
      workspacesDir:
        receipt.type === 'local-worktree'
          ? path.dirname(receipt.rootPath || '')
          : undefined,
      worktreesDir:
        receipt.type === 'local-worktree'
          ? path.dirname(receipt.rootPath || '')
          : undefined,
    };
    const provider = ProviderFactory.getProvider(projectCtx, infra);
    return provider.listCapsules();
  }

  private async fetchRealityStatus(receipt: StationReceipt): Promise<string> {
    const repoRoot = process.cwd();
    const projectCtx: ProjectContext = {
      repoRoot,
      repoName: receipt.repo || detectRepoName(repoRoot),
    };

    if (receipt.type === 'local-worktree') {
      const alive =
        !!receipt.rootPath &&
        fs.existsSync(receipt.rootPath) &&
        fs.existsSync(path.join(receipt.rootPath, '.git'));
      return alive ? 'RUNNING' : 'NOT_FOUND';
    }

    if (receipt.type === 'gce') {
      const infra: InfrastructureSpec = {
        projectId: receipt.projectId,
        zone: receipt.zone,
        instanceName: receipt.instanceName || receipt.name,
        providerType: receipt.type,
        backendType: receipt.backendType,
      };
      const provider = ProviderFactory.getProvider(projectCtx, infra);

      const status = await provider.getStatus();
      return status.status;
    }
    return 'UNKNOWN';
  }

  private async verifyAlive(receipt: StationReceipt): Promise<boolean> {
    const status = await this.fetchRealityStatus(receipt);
    return status !== 'NOT_FOUND';
  }
}

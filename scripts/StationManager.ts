/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { STATIONS_DIR } from './Constants.js';
import { loadJson } from './ConfigManager.js';
import { ProviderFactory } from './providers/ProviderFactory.js';
import { logger } from './Logger.js';

export interface StationReceipt {
  name: string;
  type: 'gce' | 'local-worktree';
  projectId: string;
  zone: string;
  repo: string;
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
    options: { syncWithReality?: boolean } = {},
  ): Promise<StationReceipt[]> {
    const files = fs
      .readdirSync(STATIONS_DIR)
      .filter((f) => f.endsWith('.json'));
    const receipts: StationReceipt[] = [];

    for (const f of files) {
      const receipt = loadJson(path.join(STATIONS_DIR, f)) as StationReceipt;
      if (!receipt) continue;

      if (options.syncWithReality) {
        const alive = await this.verifyAlive(receipt);
        if (!alive) {
          logger.info(
            'STATION',
            `🗑️  Pruning stale station record: ${receipt.name}`,
          );
          this.deleteReceipt(receipt.name);
          continue;
        }
      }
      receipts.push(receipt);
    }
    return receipts;
  }

  async getMissions(receipt: StationReceipt): Promise<string[]> {
    const provider = ProviderFactory.getProvider({
      projectId: receipt.projectId,
      zone: receipt.zone,
      instanceName: receipt.name,
      providerType: receipt.type,
      worktreesDir:
        receipt.type === 'local-worktree'
          ? path.dirname(receipt.rootPath || '')
          : undefined,
    });
    return provider.listCapsules();
  }

  private async verifyAlive(receipt: StationReceipt): Promise<boolean> {
    if (receipt.type === 'local-worktree') {
      // For local worktrees, as long as the directory exists and is a git dir, it's alive
      return (
        !!receipt.rootPath &&
        fs.existsSync(receipt.rootPath) &&
        fs.existsSync(path.join(receipt.rootPath, '.git'))
      );
    }

    if (receipt.type === 'gce') {
      const provider = ProviderFactory.getProvider({
        projectId: receipt.projectId,
        zone: receipt.zone,
        instanceName: receipt.name,
        providerType: 'gce',
      });
      const status = await provider.getStatus();
      return status.status !== 'NOT_FOUND';
    }
    return false;
  }
}

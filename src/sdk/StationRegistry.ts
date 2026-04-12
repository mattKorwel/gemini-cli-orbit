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
import { logger } from '../core/Logger.js';
import {
  type IStationRegistry,
  type IProviderFactory,
  type IConfigManager,
  type StationReceipt,
  type HydratedStation,
} from '../core/interfaces.js';

export class StationRegistry implements IStationRegistry {
  constructor(
    private readonly providerFactory: IProviderFactory,
    private readonly configManager: IConfigManager,
  ) {
    if (!fs.existsSync(STATIONS_DIR)) {
      fs.mkdirSync(STATIONS_DIR, { recursive: true });
    }
  }

  saveReceipt(receipt: StationReceipt): void {
    const p = path.join(STATIONS_DIR, `${receipt.name}.json`);

    if (fs.existsSync(p)) {
      try {
        const existing = JSON.parse(
          fs.readFileSync(p, 'utf8'),
        ) as StationReceipt;
        const { lastSeen: _l, ...eRest } = existing;
        const { lastSeen: _n, ...nRest } = receipt;

        // Metadata matches?
        if (JSON.stringify(eRest) === JSON.stringify(nRest)) {
          const lastSeenTime = new Date(existing.lastSeen).getTime();
          const now = new Date().getTime();
          const oneHour = 3600 * 1000;

          // Only skip if lastSeen is less than an hour old
          if (now - lastSeenTime < oneHour) {
            return;
          }
        }
      } catch (_e) {
        // Corrupt file? Just overwrite.
      }
    }

    fs.writeFileSync(p, JSON.stringify(receipt, null, 2));
  }

  deleteReceipt(name: string): void {
    const p = path.join(STATIONS_DIR, `${name}.json`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  async listStations(
    options: { syncWithReality?: boolean } = {},
  ): Promise<HydratedStation[]> {
    const settings = this.configManager.loadSettings();
    const files = fs
      .readdirSync(STATIONS_DIR)
      .filter((f) => f.endsWith('.json'));

    const receipts: StationReceipt[] = [];
    const seenNames = new Set<string>();

    // 1. Load Hardware Receipts (GCE, etc.)
    for (const f of files) {
      const receipt = this.configManager.loadJson(
        path.join(STATIONS_DIR, f),
      ) as StationReceipt;
      if (!receipt) continue;
      receipts.push(receipt);
      seenNames.add(receipt.name);
    }

    // 2. Discover Local Repos (from settings.json)
    Object.entries(settings.repos).forEach(([repoName, repoCfg]) => {
      const stationName = `local-${repoName}`;
      if (!seenNames.has(stationName)) {
        if (repoCfg.repoRoot && fs.existsSync(repoCfg.repoRoot)) {
          receipts.push({
            name: stationName,
            instanceName: stationName,
            type: 'local-worktree',
            projectId: 'local',
            zone: 'localhost',
            repo: repoName,
            rootPath: repoCfg.repoRoot,
            workspacesDir:
              repoCfg.workspacesDir || path.dirname(repoCfg.repoRoot),
            lastSeen: new Date().toISOString(),
          });
        }
      }
    });

    const stations: HydratedStation[] = receipts.map((r) =>
      this.hydrateStation(r),
    );

    if (options.syncWithReality) {
      for (const s of stations) {
        try {
          const reality = await s.provider.getStatus();
          if (reality.status === 'NOT_FOUND' && s.receipt.type === 'gce') {
            logger.info(
              'STATION',
              `🗑️  Pruning stale station record: ${s.receipt.name}`,
            );
            this.deleteReceipt(s.receipt.name);
          }
          s.receipt.status = reality.status;
        } catch (_e: any) {
          s.receipt.status = 'UNREACHABLE';
        }
      }
    }

    return stations;
  }

  /**
   * Maps a raw receipt to a functional HydratedStation with a pre-configured provider.
   */
  private hydrateStation(receipt: StationReceipt): HydratedStation {
    const projectCtx: ProjectContext = {
      repoRoot: receipt.rootPath || process.cwd(),
      repoName: receipt.repo,
    };

    const infra: InfrastructureSpec = {
      projectId: receipt.projectId,
      zone: receipt.zone,
      instanceName: receipt.instanceName || receipt.name,
      providerType: receipt.type,
      networkAccessType: receipt.networkAccessType,
      workspacesDir: receipt.workspacesDir,
      dnsSuffix: receipt.dnsSuffix,
      userSuffix: receipt.userSuffix,
      sshUser: receipt.sshUser,
      schematic: receipt.schematic,
    };

    const state = receipt.externalIp
      ? { status: 'ready' as const, publicIp: receipt.externalIp }
      : undefined;

    return {
      receipt,
      provider: this.providerFactory.getProvider(projectCtx, infra, state),
    };
  }
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { type OrbitObserver } from '../core/types.js';
import { LogLevel } from '../core/Logger.js';
import { type StationTransport } from '../core/interfaces.js';

/**
 * ShadowManager: Discrete handler for local development overrides (--dev).
 * Overwrites the remote station's application logic with the local bundle.
 */
export class ShadowManager {
  constructor(
    private readonly transport: StationTransport,
    private readonly observer: OrbitObserver,
  ) {}

  /**
   * Syncs the local bundle folder to the remote station's primary bin directory.
   */
  async syncIfRequested(args: { dev?: boolean }): Promise<boolean> {
    if (!args.dev) return false;

    this.observer.onLog?.(
      LogLevel.INFO,
      'DEV',
      '🌒 Shadow Mode: Syncing local bundle to remote station...',
    );

    try {
      // Sync the entire bundle folder (server, mission, hooks, etc.)
      const localBundleDir = path.resolve('bundle');
      const remoteBinDir = '/mnt/disks/data/bin';

      // Use trailing slash to sync contents, not the folder itself
      await this.transport.sync(`${localBundleDir}/`, remoteBinDir, {
        delete: true, // Clean up old files
        quiet: true,
        sudo: true,
      });

      this.observer.onLog?.(
        LogLevel.INFO,
        'DEV',
        '   ✅ Remote logic updated from local bundle.',
      );
      return true;
    } catch (err: any) {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'DEV',
        `❌ Shadow sync failed: ${err.message}`,
      );
      return false;
    }
  }
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LogLevel } from '../core/Logger.js';
import { type OrbitObserver } from '../core/types.js';
import { type IShellIntegration } from '../core/interfaces.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class IntegrationManager {
  constructor(
    private readonly observer: OrbitObserver,
    private readonly integration: IShellIntegration,
  ) {}

  /**
   * Install Orbit shell aliases and tab-completion.
   */
  async installShell(): Promise<void> {
    this.observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      '🐚 Installing Orbit shell integration...',
    );

    // Resolve shim path (similar to src/core/install-shell.ts)
    let extensionRoot = path.resolve(__dirname, '../..');
    if (!fs.existsSync(path.join(extensionRoot, 'package.json'))) {
      extensionRoot = path.resolve(__dirname, '..');
    }

    const bundlePath = path.join(extensionRoot, 'bundle', 'orbit-cli.js');
    const sourcePath = path.join(extensionRoot, 'src', 'cli', 'cli.ts');

    let shimPath = '';
    if (fs.existsSync(bundlePath)) {
      shimPath = bundlePath;
    } else if (fs.existsSync(sourcePath)) {
      shimPath = sourcePath;
    } else {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'SETUP',
        '❌ Could not find Orbit CLI entry point.',
      );
      return;
    }

    const success = this.integration.install(shimPath);
    if (success) {
      this.observer.onLog?.(
        LogLevel.INFO,
        'SETUP',
        '✅ Shell integration installed successfully.',
      );
    } else {
      this.observer.onLog?.(
        LogLevel.ERROR,
        'SETUP',
        '❌ Failed to install shell integration.',
      );
    }
  }
}

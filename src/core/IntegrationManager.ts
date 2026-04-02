/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { LogLevel } from './Logger.js';
import { type OrbitObserver } from './types.js';

export class IntegrationManager {
  constructor(private readonly observer: OrbitObserver) {}

  /**
   * Install Orbit shell aliases and tab-completion.
   */
  async installShell(): Promise<void> {
    this.observer.onLog?.(
      LogLevel.INFO,
      'SETUP',
      '🐚 Installing Orbit shell integration...',
    );
    const home = os.homedir();
    const zshrc = path.join(home, '.zshrc');
    const bashrc = path.join(home, '.bashrc');

    const line = 'alias orbit="npx @google/gemini-orbit-extension"';

    [zshrc, bashrc].forEach((p) => {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        if (!content.includes(line)) {
          fs.appendFileSync(p, `\n${line}\n`);
          this.observer.onLog?.(
            LogLevel.INFO,
            'SETUP',
            `✅ Added alias to ${p}`,
          );
        }
      }
    });
  }
}

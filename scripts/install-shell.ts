/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ShellIntegration } from './utils/ShellIntegration.js';
import { logger } from './Logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_PATH = __dirname;

async function run() {
  logger.divider('ORBIT SHELL INTEGRATION');

  // Priority: bundle/orbit-shim.js > scripts/orbit-shim.ts
  const bundleShim = path.join(
    path.dirname(SCRIPTS_PATH),
    'bundle/orbit-shim.js',
  );
  const sourceShim = path.join(SCRIPTS_PATH, 'orbit-shim.ts');
  const shimPath = fs.existsSync(bundleShim) ? bundleShim : sourceShim;

  logger.info('SHELL', `Targeting shim: ${shimPath}`);

  const shellIntegration = new ShellIntegration();
  const shells = ['zsh', 'bash'];

  for (const s of shells) {
    logger.info('SHELL', `Integrating with ${s}...`);
    shellIntegration.install(shimPath, s);
  }

  logger.info('SHELL', '✨ Integration complete.');
  logger.info(
    'SHELL',
    '🚀 Use "orbit <cmd>" for full CLI or aliases: gm (smart), gml (local), gmr (remote).',
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

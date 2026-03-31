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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runInstallShell() {
  logger.divider('ORBIT SHELL INTEGRATION');

  // Find the project root by looking for package.json
  let projectRoot = __dirname;
  while (projectRoot !== path.parse(projectRoot).root) {
    if (fs.existsSync(path.join(projectRoot, 'package.json'))) break;
    projectRoot = path.dirname(projectRoot);
  }

  const bundleShim = path.join(projectRoot, 'bundle/orbit-cli.js');
  const sourceShim = path.join(projectRoot, 'scripts/orbit-cli.ts');
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

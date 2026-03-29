/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShellIntegration } from './utils/ShellIntegration.js';
import { logger } from './Logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_PATH = __dirname;

async function run() {
  logger.divider('ORBIT SHELL INTEGRATION');

  const shimPath = path.join(SCRIPTS_PATH, 'orbit-shim.ts');
  logger.info('SHELL', `Targeting shim: ${shimPath}`);

  const shellIntegration = new ShellIntegration();
  const success = shellIntegration.install(shimPath);

  if (success) {
    logger.info('SHELL', '✨ Integration complete.');
  } else {
    logger.error('SHELL', '❌ Integration failed.');
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

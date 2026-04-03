/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ShellIntegration } from '../utils/ShellIntegration.js';
import { logger } from './Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Entry point for shell integration installation.
 */
export async function runInstallShell(): Promise<void> {
  const integration = new ShellIntegration();

  // Determine the shim path (the script to run when 'orbit' is called)
  // 1. Try to find the bundle first (production)
  // 2. Fallback to src/cli/cli.ts (development)

  let extensionRoot = path.resolve(__dirname, '../..');
  if (!fs.existsSync(path.join(extensionRoot, 'package.json'))) {
    // If we are in the bundle, we might be deeper
    extensionRoot = path.resolve(__dirname, '..');
  }

  const bundlePath = path.join(extensionRoot, 'bundle', 'cli.js');
  const sourcePath = path.join(extensionRoot, 'src', 'cli', 'cli.ts');

  let shimPath = '';
  if (fs.existsSync(bundlePath)) {
    shimPath = bundlePath;
  } else if (fs.existsSync(sourcePath)) {
    shimPath = sourcePath;
  } else {
    throw new Error(
      `Could not find Orbit CLI entry point at ${bundlePath} or ${sourcePath}`,
    );
  }

  logger.info('SETUP', `Found Orbit CLI at: ${shimPath}`);

  const success = integration.install(shimPath);
  if (!success) {
    throw new Error('Failed to install shell integration.');
  }
}

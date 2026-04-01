/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { runInstallShell } from '../../core/install-shell.js';

runInstallShell().catch((e) => {
  console.error(e);
  process.exit(1);
});

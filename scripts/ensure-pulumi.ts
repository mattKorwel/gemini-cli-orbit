/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DependencyManager } from '../src/sdk/DependencyManager.js';
import { ProcessManager } from '../src/core/ProcessManager.js';

async function main() {
  console.log('☁️  Ensuring Pulumi is installed...');
  const pm = new ProcessManager();
  const dm = new DependencyManager(pm);
  const binPath = await dm.ensurePulumi();
  console.log(`✅ Pulumi is ready at: ${binPath}`);
}

main().catch((err) => {
  console.error('❌ Failed to ensure Pulumi:', err.message);
  process.exit(1);
});

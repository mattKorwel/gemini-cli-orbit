/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isDirectHookExecution, runHookCli } from './hooks.js';

if (isDirectHookExecution()) {
  runHookCli()
    .then((code) => process.exit(code))
    .catch(() => process.exit(0));
}

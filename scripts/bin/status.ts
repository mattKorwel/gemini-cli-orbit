/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { runStatus } from '../status.js';

runStatus(process.env)
  .then((code) => process.exit(code || 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

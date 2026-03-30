/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { runSetup } from '../setup.js';
import { logger } from '../Logger.js';

runSetup(process.env)
  .then((code) => process.exit(code || 0))
  .catch((err) => {
    logger.error('FATAL', err);
    process.exit(1);
  });

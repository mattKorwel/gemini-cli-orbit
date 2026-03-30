#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { runDesign } from '../fleet.js';

const args = process.argv.slice(2);

runDesign(args)
  .then((code) => {
    if (code !== 0) process.exit(code);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

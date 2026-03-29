/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { runReap } from '../reap.js';

const args = process.argv.slice(2);
const thresholdHours = parseInt(
  args.find((a) => a.startsWith('--threshold='))?.split('=')[1] || '4',
);
const force = args.includes('--force');

runReap({ threshold: thresholdHours, force }, process.env)
  .then((code) => process.exit(code || 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

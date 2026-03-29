/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_TEMP_DIR } from './Constants.js';
import fs from 'node:fs';
import path from 'node:path';

export async function runBlackbox(args: string[]) {
  const prNumber = args[0];
  const action = args[1] || 'review';

  if (!prNumber) {
    console.error('Usage: orbit blackbox <PR_NUMBER> [action]');
    return 1;
  }

  console.log(
    `🕵️  Searching blackbox for mission PR #${prNumber} (${action})...`,
  );

  const localPattern = `orbit-${prNumber}-${action}-`;
  if (!fs.existsSync(DEFAULT_TEMP_DIR)) {
    console.log(
      '❌ No local mission recordings found (Temp directory missing).',
    );
    return 1;
  }

  const localDirs = fs
    .readdirSync(DEFAULT_TEMP_DIR)
    .filter((d) => d.startsWith(localPattern))
    .map((d) => ({
      name: d,
      time: fs.statSync(path.join(DEFAULT_TEMP_DIR, d)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);

  const dir = localDirs[0];
  if (!dir) {
    console.log(`❌ No local recordings found for PR #${prNumber}.`);
    return 1;
  }
  const latestLocal = path.join(DEFAULT_TEMP_DIR, dir.name);
  console.log(`📂 Found mission recording: ${latestLocal}`);

  const logs = fs.readdirSync(latestLocal).filter((f) => f.endsWith('.log'));
  if (logs.length > 0) {
    console.log('\n--- MISSION LOG FILES ---');
    logs.forEach((log) => console.log(`- ${log}`));
    console.log(
      `\nTip: To stream these logs, run: tail -f ${latestLocal}/*.log`,
    );
  } else {
    console.log('❌ recording directory is empty.');
  }

  return 0;
}

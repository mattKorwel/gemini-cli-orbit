/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { GLOBAL_HOME_ENV_FILE } from '../core/Constants.js';

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const exportLine = line.startsWith('export ') ? line.slice(7).trim() : line;
    const equalsIndex = exportLine.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = exportLine.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    const rawValue = exportLine.slice(equalsIndex + 1).trim();
    result[key] = stripWrappingQuotes(rawValue);
  }

  return result;
}

export function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return parseDotEnv(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

export function loadAuthEnvChain(repoRoot: string): Record<string, string> {
  const envChain: Record<string, string> = {};

  for (const filePath of [GLOBAL_HOME_ENV_FILE, path.join(repoRoot, '.env')]) {
    Object.assign(envChain, loadEnvFile(filePath));
  }

  return envChain;
}

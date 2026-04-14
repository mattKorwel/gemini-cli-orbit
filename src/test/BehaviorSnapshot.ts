/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

interface BehaviorSnapshotOptions {
  placeholders?: Record<string, string>;
  stripEnvVars?: string[];
  stripEnvKeys?: string[];
  volatileReplacements?: Array<[RegExp, string]>;
  commandNames?: string[];
}

const DEFAULT_HISTORY_ENV_VARS = [
  'WT_SESSION',
  'TERM',
  'COLORTERM',
  'FORCE_COLOR',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'TERM_SESSION_ID',
];

const DEFAULT_ENV_KEYS = [
  'WT_SESSION',
  'TERM_SESSION_ID',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'SSH_AUTH_SOCK',
  'SSH_CLIENT',
  'SSH_CONNECTION',
  'SSH_TTY',
];

const DEFAULT_COMMAND_NAMES = ['tmux', 'git', 'docker', 'gh'];

function normalizeSlashes(value: string): string {
  let normalized = value.replaceAll('\\', '/');
  // Normalize macOS /private prefix which is inconsistent across environments
  // Replace globally as it may appear in different parts of a log string
  normalized = normalized.replaceAll('/private/var', '/var');
  normalized = normalized.replaceAll('/private/tmp', '/tmp');
  return normalized;
}

function applyPlaceholders(
  value: string,
  placeholders: Record<string, string>,
): string {
  let normalized = value;
  for (const [source, token] of Object.entries(placeholders).sort(
    ([left], [right]) => right.length - left.length,
  )) {
    normalized = normalized.replaceAll(normalizeSlashes(source), token);
  }
  return normalized;
}

export function normalizeBehaviorText(
  value: string,
  options: BehaviorSnapshotOptions = {},
): string {
  let normalized = normalizeSlashes(value);
  if (options.placeholders) {
    normalized = applyPlaceholders(normalized, options.placeholders);
  }
  for (const [pattern, replacement] of options.volatileReplacements || []) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

export function normalizeBehaviorHistory(
  history: string[],
  options: BehaviorSnapshotOptions = {},
): string[] {
  const stripEnvVars = options.stripEnvVars || DEFAULT_HISTORY_ENV_VARS;
  const commandNames = options.commandNames || DEFAULT_COMMAND_NAMES;
  const commandPattern = commandNames.join('|').replace(/\./g, '\\.');

  return history.map((line) => {
    let normalized = normalizeBehaviorText(line, options);
    normalized = normalized.replace(/^(\[[^\]]+\]\s+).*node(\.exe)?\s+/, '$1');
    normalized = normalized.replace(/^.*node(\.exe)?\s+/, '');
    normalized = normalized.replace(
      /^(\[[^\]]+\]\s+).*powershell(\.exe)?\s+-NoProfile(?:\s+-ExecutionPolicy\s+\S+)?\s+-EncodedCommand\s+[A-Za-z0-9+/=]+\s+/,
      '$1',
    );
    normalized = normalized.replace(
      /^.*powershell(\.exe)?\s+-NoProfile(?:\s+-ExecutionPolicy\s+\S+)?\s+-EncodedCommand\s+[A-Za-z0-9+/=]+\s+/,
      '',
    );

    for (const envVar of stripEnvVars) {
      const escaped = envVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Matches: -e VAR=VAL or -e VAR='VAL' or -e VAR="VAL"
      // Handles values without spaces or quoted values
      normalized = normalized.replace(
        new RegExp(`\\s+-e\\s+${escaped}=([^\\s"']+|"[^"]*"|'[^']*')`, 'g'),
        '',
      );
    }

    normalized = normalized.replace(
      new RegExp(
        `(^\\[[^\\]]+\\]\\s+)(?:[A-Za-z]:)?[^\\s]*\\/(${commandPattern})(?:\\.exe|\\.js)?(?=\\s|$)`,
        'i',
      ),
      '$1$2',
    );
    normalized = normalized.replace(
      new RegExp(`\\b(${commandPattern})(?:\\.exe|\\.js)\\b`, 'gi'),
      '$1',
    );
    return normalized;
  });
}

export function normalizeBehaviorEnv(
  env: Record<string, string> | undefined,
  options: BehaviorSnapshotOptions = {},
): Record<string, string> | undefined {
  if (!env) {
    return env;
  }

  const normalized = { ...env };
  for (const key of options.stripEnvKeys || DEFAULT_ENV_KEYS) {
    delete normalized[key];
  }

  return Object.fromEntries(
    Object.entries(normalized).map(([key, value]) => [
      key,
      normalizeBehaviorText(value, options),
    ]),
  );
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const TERMINAL_IDENTITY_KEYS = [
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'WT_SESSION',
  'TERM_SESSION_ID',
] as const;

export function getDefinedProcessEnv(
  sourceEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(sourceEnv).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

export function getInteractiveTerminalEnv(
  sourceEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const terminalEnv: Record<string, string> = {
    TERM: sourceEnv.TERM || 'xterm-256color',
    COLORTERM: sourceEnv.COLORTERM || 'truecolor',
    FORCE_COLOR: sourceEnv.FORCE_COLOR || '3',
  };

  for (const key of TERMINAL_IDENTITY_KEYS) {
    const value = sourceEnv[key];
    if (value) {
      terminalEnv[key] = value;
    }
  }

  return terminalEnv;
}

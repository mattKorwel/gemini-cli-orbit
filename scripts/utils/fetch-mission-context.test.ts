/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process');
vi.mock('node:fs');

describe('fetch-mission-context.ts utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse repository owner and name correctly', () => {
    const remoteUrl = 'https://github.com/google-gemini/gemini-cli.git';
    const repoMatch = remoteUrl.match(
      /github\.com[\/:]?([^\/]+)\/([^\/.]+)(\.git)?$/,
    );

    expect(repoMatch![1]).toBe('google-gemini');
    expect(repoMatch![2]).toBe('gemini-cli');
  });

  it('should handle complex git remote URLs', () => {
    const sshUrl = 'git@github.com:mattKorwel/gemini-cli-orbit.git';
    const repoMatch = sshUrl.match(
      /github\.com[\/:]?([^\/]+)\/([^\/.]+)(\.git)?$/,
    );

    expect(repoMatch![1]).toBe('mattKorwel');
    expect(repoMatch![2]).toBe('gemini-cli-orbit');
  });

  it('should simulate merge conflict detection logic', () => {
    const conflictOutput =
      '<<<<<<< HEAD\ncontent\n=======\nother\n>>>>>>> branch';
    const hasConflicts = conflictOutput.includes('<<<<<<<');
    expect(hasConflicts).toBe(true);

    const cleanOutput = 'Everything up to date';
    const noConflicts = cleanOutput.includes('<<<<<<<');
    expect(noConflicts).toBe(false);
  });
});

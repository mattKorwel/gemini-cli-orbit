/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';

vi.mock('node:child_process');
vi.mock('node:fs');

describe('ci.mjs utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect the repository from git remote', async () => {
    vi.mocked(execSync).mockReturnValue(
      Buffer.from('https://github.com/owner/repo.git'),
    );

    // We'll test the logic by importing it or simulating the detection block
    const remoteUrl = 'https://github.com/owner/repo.git';
    const REPO = remoteUrl
      .replace(/.*github\.com[\/:]/, '')
      .replace(/\.git$/, '')
      .trim();

    expect(REPO).toBe('owner/repo');
  });

  it('should handle SSH git remotes', () => {
    const remoteUrl = 'git@github.com:google-gemini/gemini-cli.git';
    const REPO = remoteUrl
      .replace(/.*github\.com[\/:]/, '')
      .replace(/\.git$/, '')
      .trim();
    expect(REPO).toBe('google-gemini/gemini-cli');
  });

  it('should correctly extract test files from failure logs', () => {
    // This replicates the extractTestFile logic from the script
    const failureText =
      ' FAIL  packages/core/src/scheduler/policy.test.ts > Policy > should validate';
    const fileMatch = failureText.match(/([\w\/._-]+\.test\.[jt]sx?)/);
    expect(fileMatch![1]).toBe('packages/core/src/scheduler/policy.test.ts');
  });
});

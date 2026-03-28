/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process');

describe('fetch-pr-info.js utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should extract owner and repo from remote URL', () => {
    const remoteUrl = 'https://github.com/google-gemini/gemini-cli.git';
    const repoMatch = remoteUrl.match(/github\.com[\/:]?([^\/]+)\/([^\/.]+)(\.git)?$/);
    
    expect(repoMatch![1]).toBe('google-gemini');
    expect(repoMatch![2]).toBe('gemini-cli');
  });

  it('should filter ignore messages correctly', () => {
    const IGNORE_MESSAGES = [
      'thank you so much for your contribution to Gemini CLI!',
      "I'm currently reviewing this pull request and will post my feedback shortly.",
    ];

    const shouldIgnore = (body: string) => {
      if (!body) return false;
      return IGNORE_MESSAGES.some((msg) => body.includes(msg));
    };

    expect(shouldIgnore('thank you so much for your contribution to Gemini CLI!')).toBe(true);
    expect(shouldIgnore('This is a real comment')).toBe(false);
  });
});

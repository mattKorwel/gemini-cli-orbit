/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  UPSTREAM_REPO_URL,
  DEFAULT_REPO_NAME,
  SCHEMATICS_DIR,
} from './Constants.js';

describe('Constants', () => {
  it('should have correct repository metadata', () => {
    expect(UPSTREAM_REPO_URL).toBe(
      'https://github.com/google-gemini/gemini-cli.git',
    );
    expect(DEFAULT_REPO_NAME).toBe('gemini-cli');
  });

  it('should have a valid schematics directory path', () => {
    const normalized = SCHEMATICS_DIR.replace(/\\/g, '/');
    expect(normalized).toContain('.gemini/orbit/schematics');
    expect(normalized).not.toContain('.gemini/orbit/schematics/.gemini'); // Should be top-level in home
  });
});

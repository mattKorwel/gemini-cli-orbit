/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main } from './station.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Worker Integration (High-Fidelity)', () => {
  let tempDir: string;
  let workspaceDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-worker-test-'));
    workspaceDir = path.join(tempDir, 'workspace');
    fs.mkdirSync(workspaceDir);

    // Change to workspace dir so .orbit-manifest.json is found
    vi.spyOn(process, 'cwd').mockReturnValue(workspaceDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should perform a full chunky initialization locally', async () => {
    // 1. Setup Manifest
    const manifest = {
      identifier: 'test-mission',
      repoName: 'test-repo',
      branchName: 'feat/test',
      action: 'chat',
      workDir: workspaceDir,
    };
    fs.writeFileSync(
      path.join(workspaceDir, '.orbit-manifest.json'),
      JSON.stringify(manifest),
    );

    // 2. Setup Mock PM
    const mockPm: any = {
      runSync: vi.fn().mockImplementation((bin, args) => {
        if (bin === 'git' && args.includes('rev-parse')) {
          return { status: 128, stdout: '', stderr: 'Not a repo' }; // Not a repo
        }
        return { status: 0, stdout: '', stderr: '' };
      }),
    };

    // 3. Act
    const exitCode = await main(['init'], mockPm);

    // 4. Assert
    expect(exitCode).toBe(0);
    expect(mockPm.runSync).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['init']),
      expect.anything(),
    );
  });

  it('should handle existing directories gracefully', async () => {
    // 1. Setup Manifest
    const manifest = {
      identifier: 'test-mission',
      repoName: 'test-repo',
      branchName: 'feat/test',
      action: 'chat',
      workDir: workspaceDir,
    };
    fs.writeFileSync(
      path.join(workspaceDir, '.orbit-manifest.json'),
      JSON.stringify(manifest),
    );

    // 2. Mock existing git repo
    const mockPm: any = {
      runSync: vi.fn().mockImplementation((bin, args) => {
        if (bin === 'git' && args.includes('rev-parse')) {
          return { status: 0, stdout: '', stderr: '' }; // Is a repo
        }
        return { status: 0, stdout: '', stderr: '' };
      }),
    };

    const exitCode = await main(['init'], mockPm);
    expect(exitCode).toBe(0);
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { WorkspaceManager } from './WorkspaceManager.js';

vi.mock('node:fs');

describe('WorkspaceManager', () => {
  const git: any = {
    revParse: vi.fn(),
    init: vi.fn(),
    remoteAdd: vi.fn(),
    fetch: vi.fn(),
    verify: vi.fn(),
    checkout: vi.fn(),
    checkoutNew: vi.fn(),
  };

  const config: any = {
    hostRoot: '/orbit/data',
    manifestRoot: '/orbit/data/manifests',
    storage: {
      workspacesRoot: '/orbit/data/workspaces',
      mirrorPath: '/orbit/data/main',
    },
    mounts: [{ host: '/orbit/data', capsule: '/orbit/data' }],
  };

  let workspace: WorkspaceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    workspace = new WorkspaceManager(git, config);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // Use a properly typed mock for mkdirSync
    vi.mocked(fs.mkdirSync).mockImplementation((() => {}) as any);
    vi.mocked(fs.writeFileSync).mockImplementation((() => {}) as any);

    git.revParse.mockReturnValue({ status: 1 });
    git.init.mockReturnValue({ status: 0 });
    git.remoteAdd.mockReturnValue({ status: 0 });
    git.fetch.mockImplementation(
      (_cwd: string, _remote: string, branch: string) =>
        branch === 'HEAD'
          ? { status: 0, stdout: '', stderr: '' }
          : { status: 1, stdout: '', stderr: 'not found' },
    );
    git.verify.mockReturnValue({ status: 1, stdout: '', stderr: 'not found' });
    git.checkout.mockReturnValue({ status: 0 });
    git.checkoutNew.mockReturnValue({ status: 0 });
  });

  it('creates a missing mission branch from remote default HEAD', async () => {
    await workspace.ensureWorkspace({
      workDir: '/orbit/data/workspaces/gemini-cli-orbit/mission-main',
      upstreamUrl: 'https://github.com/org/repo.git',
      branchName: 'mission-main',
      mirrorPath: '/orbit/data/main',
    });

    expect(git.fetch).toHaveBeenNthCalledWith(
      2,
      '/orbit/data/workspaces/gemini-cli-orbit/mission-main',
      'origin',
      'HEAD',
      { quiet: true },
    );
    expect(git.checkoutNew).toHaveBeenCalledWith(
      '/orbit/data/workspaces/gemini-cli-orbit/mission-main',
      'mission-main',
      'FETCH_HEAD',
      { quiet: true },
    );
  });
});

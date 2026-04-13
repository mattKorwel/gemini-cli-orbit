/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeBehaviorEnv,
  normalizeBehaviorHistory,
  normalizeBehaviorText,
} from './BehaviorSnapshot.js';

describe('BehaviorSnapshot', () => {
  it('normalizes wrappers, placeholders, env noise, and executable suffixes', () => {
    const history = normalizeBehaviorHistory(
      [
        `[C:/tmp/repo] C:/Program Files/node.exe C:/tmp/bin/tmux.exe -e WT_SESSION=abc -e TERM=xterm`,
        `[C:/tmp/repo] powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand abc123 C:/tmp/bin/tmux.exe new-session`,
      ],
      {
        placeholders: {
          'C:/tmp/repo': '<repo>',
          'C:/tmp/bin': '<bin>',
        },
      },
    );

    expect(history).toEqual(['[<repo>] tmux', '[<repo>] tmux new-session']);
  });

  it('normalizes paths and strips non-deterministic env keys', () => {
    const env = normalizeBehaviorEnv(
      {
        TERM_PROGRAM: 'WindowsTerminal',
        WORK_DIR: 'C:\\tmp\\repo\\workspaces\\m1',
      },
      {
        placeholders: {
          'C:/tmp/repo': '<tmp>',
        },
      },
    );

    expect(env).toEqual({
      WORK_DIR: '<tmp>/workspaces/m1',
    });
    expect(
      normalizeBehaviorText('/tmp/orbit-git-worktrees/demo', {
        volatileReplacements: [
          [/^\/tmp\/orbit-git-worktrees\//, '<tmp>/orbit-git-worktrees/'],
        ],
      }),
    ).toBe('<tmp>/orbit-git-worktrees/demo');
  });
});

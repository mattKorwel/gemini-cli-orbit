/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { StationPathResolver } from './StationPathResolver.js';

describe('StationPathResolver', () => {
  it('maps capsule paths to Windows host paths through hydrated mount areas', () => {
    const resolver = new StationPathResolver({
      manifestRoot: '/orbit/manifests',
      mounts: [
        {
          host: 'C:\\orbit-root',
          capsule: '/orbit',
        },
        {
          host: 'C:\\ramdisk',
          capsule: '/dev/shm',
        },
      ],
      areas: {
        manifests: {
          host: 'C:\\orbit-root\\manifests',
          capsule: '/orbit/manifests',
          kind: 'dir',
        },
      },
      storage: {
        workspacesRoot: '/orbit/workspaces',
        mirrorPath: '/orbit/main',
      },
      port: 8080,
      workerImage: 'worker',
      isUnlocked: false,
      useSudo: false,
      bundlePath: '/orbit/bundle',
    });

    expect(
      resolver.toHostPath('/orbit/workspaces/test-repo/demo/.gemini/orbit'),
    ).toBe('C:\\orbit-root\\workspaces\\test-repo\\demo\\.gemini\\orbit');
    expect(resolver.getWorkspaceHostRoot()).toBe('C:\\orbit-root\\workspaces');
    expect(resolver.getSecretEnvCapsulePath('demo-123')).toBe(
      '/dev/shm/.orbit-env-demo-123',
    );
  });

  it('resolves manifest capsule root from a host-path config when tests pass one in directly', () => {
    const resolver = new StationPathResolver({
      manifestRoot: 'C:\\orbit-root\\manifests',
      mounts: [
        {
          host: 'C:\\orbit-root',
          capsule: '/orbit',
        },
      ],
      areas: {
        manifests: {
          host: 'C:\\orbit-root\\manifests',
          capsule: '/orbit/manifests',
          kind: 'dir',
        },
      },
      storage: {
        workspacesRoot: '/orbit/workspaces',
        mirrorPath: '/orbit/main',
      },
      port: 8080,
      workerImage: 'worker',
      isUnlocked: false,
      useSudo: false,
      bundlePath: '/orbit/bundle',
    });

    expect(resolver.getManifestCapsuleRoot()).toBe('/orbit/manifests');
  });
});

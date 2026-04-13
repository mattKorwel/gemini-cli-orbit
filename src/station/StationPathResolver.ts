/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type StationPathArea,
  type StationSupervisorConfig,
} from '../core/types.js';
import {
  buildMountAreas,
  normalizeCapsulePath,
  normalizeHostPath,
  resolveCapsulePathFromAreas,
  resolveHostPathFromAreas,
} from './MountRegistry.js';

const WINDOWS_DRIVE_RE = /^[A-Z]:/i;
const SECRET_ENV_ROOT = '/dev/shm';

export class StationPathResolver {
  readonly mountAreas: StationPathArea[];

  constructor(private readonly config: StationSupervisorConfig) {
    this.mountAreas = buildMountAreas(config.mounts, config.areas);
  }

  toHostPath(targetPath: string): string {
    if (!targetPath) {
      return targetPath;
    }

    if (WINDOWS_DRIVE_RE.test(targetPath)) {
      return normalizeHostPath(targetPath);
    }

    if (!targetPath.startsWith('/')) {
      return targetPath;
    }

    const normalizedPath = normalizeCapsulePath(targetPath);
    return (
      resolveHostPathFromAreas(normalizedPath, this.mountAreas) ||
      normalizedPath
    );
  }

  getWorkspaceHostRoot(): string {
    return this.toHostPath(this.config.storage.workspacesRoot);
  }

  getManifestCapsuleRoot(): string {
    const manifestsArea = this.config.areas?.manifests?.capsule;
    if (manifestsArea) {
      return normalizeCapsulePath(manifestsArea);
    }

    const manifestRoot = this.config.manifestRoot;
    if (manifestRoot) {
      if (WINDOWS_DRIVE_RE.test(manifestRoot)) {
        return (
          resolveCapsulePathFromAreas(manifestRoot, this.mountAreas) ||
          normalizeCapsulePath(manifestRoot.replace(/\\/g, '/'))
        );
      }

      const normalizedManifestRoot = normalizeCapsulePath(manifestRoot);
      if (
        resolveHostPathFromAreas(normalizedManifestRoot, this.mountAreas) !==
        undefined
      ) {
        return normalizedManifestRoot;
      }

      return (
        resolveCapsulePathFromAreas(manifestRoot, this.mountAreas) ||
        normalizedManifestRoot
      );
    }

    return '/orbit/manifests';
  }

  getSecretEnvCapsulePath(uniqueContainerName: string): string {
    return normalizeCapsulePath(
      `${SECRET_ENV_ROOT}/.orbit-env-${uniqueContainerName}`,
    );
  }
}

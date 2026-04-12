/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { type MountPoint, type StationPathArea } from '../core/types.js';

const WINDOWS_DRIVE_RE = /^[A-Z]:/i;

export function normalizeCapsulePath(targetPath: string): string {
  const normalized = path.posix.normalize(targetPath.replace(/\\/g, '/'));
  if (normalized === '.') {
    return '/';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export function normalizeHostPath(targetPath: string): string {
  if (WINDOWS_DRIVE_RE.test(targetPath)) {
    return path.win32.normalize(targetPath);
  }
  return path.posix.normalize(targetPath);
}

export function buildMountAreas(
  mounts: MountPoint[],
  areas: Record<string, StationPathArea> = {},
): StationPathArea[] {
  const normalizedMounts = mounts.map((mount) => {
    const area: StationPathArea = {
      host: normalizeHostPath(mount.host),
      capsule: normalizeCapsulePath(mount.capsule),
      kind: 'dir',
    };
    if (mount.readonly !== undefined) {
      area.readonly = mount.readonly;
    }
    return area;
  });

  const normalizedAreas = Object.values(areas).map((area) => {
    const normalizedArea: StationPathArea = {
      host: normalizeHostPath(area.host),
      capsule: normalizeCapsulePath(area.capsule),
    };
    if (area.kind !== undefined) {
      normalizedArea.kind = area.kind;
    }
    if (area.readonly !== undefined) {
      normalizedArea.readonly = area.readonly;
    }
    return normalizedArea;
  });

  return [...normalizedMounts, ...normalizedAreas].sort(
    (left, right) => right.capsule.length - left.capsule.length,
  );
}

export function resolveHostPathFromAreas(
  capsulePath: string,
  areas: StationPathArea[],
): string | undefined {
  const normalizedCapsulePath = normalizeCapsulePath(capsulePath);

  for (const area of areas) {
    const areaCapsule = normalizeCapsulePath(area.capsule);
    const areaHost = normalizeHostPath(area.host);

    if (normalizedCapsulePath === areaCapsule) {
      return areaHost;
    }

    if (area.kind === 'file') {
      continue;
    }

    const prefix = areaCapsule.endsWith('/') ? areaCapsule : `${areaCapsule}/`;
    if (!normalizedCapsulePath.startsWith(prefix)) {
      continue;
    }

    const relativePath = normalizedCapsulePath.slice(prefix.length);
    const relativeParts = relativePath.split('/').filter(Boolean);
    if (WINDOWS_DRIVE_RE.test(areaHost)) {
      return path.win32.join(areaHost, ...relativeParts);
    }
    return path.posix.join(areaHost, ...relativeParts);
  }

  return undefined;
}

export function resolveCapsulePathFromAreas(
  hostPath: string,
  areas: StationPathArea[],
): string | undefined {
  const normalizedHostPath = normalizeHostPath(hostPath);

  for (const area of [...areas].sort(
    (left, right) => right.host.length - left.host.length,
  )) {
    const areaCapsule = normalizeCapsulePath(area.capsule);
    const areaHost = normalizeHostPath(area.host);

    if (normalizedHostPath === areaHost) {
      return areaCapsule;
    }

    if (area.kind === 'file') {
      continue;
    }

    const prefix =
      areaHost.endsWith(path.posix.sep) || WINDOWS_DRIVE_RE.test(areaHost)
        ? `${areaHost}${areaHost.endsWith('\\') || areaHost.endsWith('/') ? '' : path.sep}`
        : `${areaHost}/`;

    if (!normalizedHostPath.startsWith(prefix)) {
      continue;
    }

    const relativePath = normalizedHostPath.slice(prefix.length);
    const relativeParts = relativePath.split(/[\\/]+/).filter(Boolean);
    return normalizeCapsulePath(path.posix.join(areaCapsule, ...relativeParts));
  }

  return undefined;
}

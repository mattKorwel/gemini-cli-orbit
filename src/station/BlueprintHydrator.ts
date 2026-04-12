/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type StationPathArea,
  type StationSupervisorConfig,
} from '../core/types.js';
import { CAPSULE_ROOT } from '../core/Constants.js';
import { normalizeCapsulePath } from './MountRegistry.js';

interface StationRuntimeOverrides {
  port?: number;
  workerImage?: string;
  hostRoot?: string;
  hostPathBase?: string;
}

export function hydrateStationSupervisorConfig(
  options: {
    argv?: string[];
    env?: NodeJS.ProcessEnv;
  } = {},
): StationSupervisorConfig {
  const argv = options.argv || process.argv;
  const env = options.env || process.env;
  const blueprintPath = resolveBlueprintPath(argv, env);
  const blueprint: any = readBlueprint(blueprintPath, env);
  const runtime = collectRuntimeOverrides(env);

  applyRuntimeOverrides(blueprint, runtime);

  blueprint.hostRoot = normalizeRuntimeHostPath(
    blueprint.hostRoot,
    runtime.hostPathBase,
  );
  blueprint.manifestRoot = normalizeCapsulePath(blueprint.manifestRoot);
  blueprint.storage.workspacesRoot = normalizeCapsulePath(
    blueprint.storage.workspacesRoot,
  );
  blueprint.storage.mirrorPath = normalizeCapsulePath(
    blueprint.storage.mirrorPath,
  );

  blueprint.mounts = (blueprint.mounts || []).map((mount: any) => ({
    ...mount,
    host: resolveBlueprintMountHost(mount.host, runtime),
  }));

  blueprint.areas = buildStaticAreas(blueprint, runtime);

  return blueprint as unknown as StationSupervisorConfig;
}

function resolveBlueprintPath(argv: string[], env: NodeJS.ProcessEnv): string {
  return (
    argv.find((arg) => arg.startsWith('--config='))?.split('=')[1] ||
    env.ORBIT_STATION_CONFIG ||
    '/orbit/config/station.json'
  );
}

function readBlueprint(
  blueprintPath: string,
  env: NodeJS.ProcessEnv,
): Record<string, unknown> {
  if (fs.existsSync(blueprintPath)) {
    return JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
  }

  if (blueprintPath === '/orbit/config/station.json') {
    throw new Error(
      `🛑 CRITICAL: Production Station Blueprint not found at ${blueprintPath}`,
    );
  }

  console.warn(
    `⚠️  Station Blueprint not found at ${blueprintPath}. Using internal defaults.`,
  );

  return {
    port: 8080,
    useSudo: env.USE_SUDO === '1',
    manifestRoot: env.ORBIT_MANIFEST_ROOT || '/dev/shm',
    hostRoot: env.ORBIT_HOST_ROOT || '/mnt/disks/data',
    workerImage: 'ghcr.io/mattkorwel/orbit-worker:latest',
    storage: {
      workspacesRoot: '/orbit/data/workspaces',
      mirrorPath: '/orbit/data/main',
    },
    mounts: [
      { host: '/mnt/disks/data', capsule: '/orbit/data' },
      { host: '/dev/shm', capsule: '/orbit/manifests' },
    ],
    areas: {
      globalGemini: {
        host: './home/.gemini',
        capsule: '/orbit/home/.gemini',
        kind: 'dir',
      },
    },
    bundlePath: '/usr/local/lib/orbit/bundle',
    isUnlocked: fs.existsSync('/orbit/data/.starfleet-dev-unlocked'),
  };
}

function collectRuntimeOverrides(
  env: NodeJS.ProcessEnv,
): StationRuntimeOverrides {
  const runtime: StationRuntimeOverrides = {};

  if (env.ORBIT_SERVER_PORT) {
    runtime.port = Number(env.ORBIT_SERVER_PORT);
  }
  if (env.GCLI_ORBIT_WORKER_IMAGE) {
    runtime.workerImage = env.GCLI_ORBIT_WORKER_IMAGE;
  }
  if (env.ORBIT_HOST_ROOT) {
    runtime.hostRoot = env.ORBIT_HOST_ROOT;
  }
  if (env.GCLI_ORBIT_HOST_PATH_BASE) {
    runtime.hostPathBase = env.GCLI_ORBIT_HOST_PATH_BASE;
  }

  return runtime;
}

function applyRuntimeOverrides(
  blueprint: Record<string, any>,
  runtime: StationRuntimeOverrides,
): void {
  if (runtime.port !== undefined) {
    blueprint.port = runtime.port;
  }
  if (runtime.workerImage) {
    blueprint.workerImage = runtime.workerImage;
  }
  if (runtime.hostRoot) {
    blueprint.hostRoot = runtime.hostRoot;
  }
}

function resolveBlueprintMountHost(
  hostPath: string,
  runtime: StationRuntimeOverrides,
): string {
  return normalizeRuntimeHostPath(hostPath, runtime.hostPathBase);
}

function buildStaticAreas(
  blueprint: Record<string, any>,
  runtime: StationRuntimeOverrides,
): Record<string, StationPathArea> {
  const areas: Record<string, StationPathArea> = Object.fromEntries(
    Object.entries(blueprint.areas || {}).map(([name, area]: [string, any]) => [
      name,
      {
        ...area,
        host: resolveBlueprintMountHost(area.host, runtime),
      },
    ]),
  );

  if (blueprint.hostRoot) {
    areas.orbitRoot = {
      host: blueprint.hostRoot,
      capsule: CAPSULE_ROOT,
      kind: 'dir',
    };
  }

  const manifestsCapsulePath = path.posix.join(CAPSULE_ROOT, 'manifests');
  const manifestMount = (blueprint.mounts || []).find(
    (mount: any) =>
      normalizeCapsulePath(mount.capsule) === manifestsCapsulePath,
  );
  if (manifestMount) {
    areas.manifests = {
      host: manifestMount.host,
      capsule: manifestMount.capsule,
      kind: 'dir',
    };
  }

  const geminiCapsulePath = path.posix.join(CAPSULE_ROOT, 'home', '.gemini');
  const geminiMount = (blueprint.mounts || []).find(
    (mount: any) => normalizeCapsulePath(mount.capsule) === geminiCapsulePath,
  );
  if (geminiMount) {
    areas.globalGemini = {
      host: geminiMount.host,
      capsule: geminiMount.capsule,
      kind: 'dir',
      readonly: geminiMount.readonly,
    };
  }
  return areas;
}

function normalizeRuntimeHostPath(
  hostPath: string,
  hostPathBase?: string,
): string {
  const expandedHome =
    hostPath === '~'
      ? os.homedir()
      : hostPath.startsWith('~/') || hostPath.startsWith('~\\')
        ? path.join(os.homedir(), hostPath.slice(2))
        : hostPath;

  if (/^[A-Z]:/i.test(expandedHome)) {
    return path.win32.normalize(expandedHome);
  }

  if (path.posix.isAbsolute(expandedHome)) {
    return path.posix.normalize(expandedHome);
  }

  if (hostPathBase) {
    return path.resolve(hostPathBase, expandedHome);
  }

  throw new Error(
    `Relative host path "${hostPath}" requires GCLI_ORBIT_HOST_PATH_BASE to be set.`,
  );
}

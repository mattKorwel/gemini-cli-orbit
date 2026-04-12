/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  type StationPathArea,
  type StationSupervisorConfig,
} from '../core/types.js';
import {
  CAPSULE_BUNDLE_PATH,
  CAPSULE_ROOT,
  SUPERVISOR_ENTRYPOINT_SOURCE_PATH,
} from '../core/Constants.js';
import { normalizeCapsulePath } from './MountRegistry.js';

interface StationRuntimeOverrides {
  port?: number;
  workerImage?: string;
  hostRoot?: string;
  bundleHost?: string;
  configsHost?: string;
  geminiDirHost?: string;
  ghConfigHost?: string;
  policiesHost?: string;
  entrypointHost?: string;
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

  blueprint.manifestRoot = path.resolve(blueprint.manifestRoot);
  blueprint.storage.workspacesRoot = path.resolve(
    blueprint.storage.workspacesRoot,
  );
  blueprint.storage.mirrorPath = path.resolve(blueprint.storage.mirrorPath);

  blueprint.mounts = (blueprint.mounts || []).map((mount: any) => ({
    ...mount,
    host: resolveBlueprintMountHost(
      mount.host,
      mount.capsule,
      blueprint.hostRoot,
      runtime,
    ),
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
  if (env.GCLI_ORBIT_BUNDLE_PATH) {
    runtime.bundleHost = env.GCLI_ORBIT_BUNDLE_PATH;
  }
  if (env.GCLI_ORBIT_CONFIGS_HOST) {
    runtime.configsHost = env.GCLI_ORBIT_CONFIGS_HOST;
  }
  if (env.GCLI_ORBIT_GEMINI_DIR_HOST) {
    runtime.geminiDirHost = env.GCLI_ORBIT_GEMINI_DIR_HOST;
  }
  if (env.GCLI_ORBIT_GH_CONFIG_HOST) {
    runtime.ghConfigHost = env.GCLI_ORBIT_GH_CONFIG_HOST;
  }
  if (env.GCLI_ORBIT_POLICIES_HOST) {
    runtime.policiesHost = env.GCLI_ORBIT_POLICIES_HOST;
  }
  if (env.GCLI_ORBIT_ENTRYPOINT_HOST) {
    runtime.entrypointHost = env.GCLI_ORBIT_ENTRYPOINT_HOST;
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
  capsulePath: string,
  hostRoot: string | undefined,
  runtime: StationRuntimeOverrides,
): string {
  if (hostPath === '~/.gemini' && runtime.geminiDirHost) {
    return normalizeRuntimeHostPath(runtime.geminiDirHost);
  }
  if (hostPath === '~/.config/gh' && runtime.ghConfigHost) {
    return normalizeRuntimeHostPath(runtime.ghConfigHost);
  }

  const normalizedCapsulePath = normalizeCapsulePath(capsulePath);
  if (
    hostPath.startsWith('./') &&
    hostRoot &&
    normalizedCapsulePath.startsWith(CAPSULE_ROOT)
  ) {
    const relativePath = path.posix.relative(
      CAPSULE_ROOT,
      normalizedCapsulePath,
    );
    const relativeParts = relativePath.split('/').filter(Boolean);
    if (/^[A-Z]:/i.test(hostRoot)) {
      return path.win32.join(hostRoot, ...relativeParts);
    }
    return path.posix.join(hostRoot, ...relativeParts);
  }

  return normalizeRuntimeHostPath(hostPath);
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
        host: resolveBlueprintMountHost(
          area.host,
          area.capsule,
          blueprint.hostRoot,
          runtime,
        ),
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

  if (runtime.bundleHost) {
    areas.bundle = {
      host: normalizeRuntimeHostPath(runtime.bundleHost),
      capsule: CAPSULE_BUNDLE_PATH,
      kind: 'dir',
      readonly: true,
    };
  }

  if (runtime.configsHost) {
    areas.configs = {
      host: normalizeRuntimeHostPath(runtime.configsHost),
      capsule: path.posix.join(CAPSULE_ROOT, 'configs'),
      kind: 'dir',
      readonly: true,
    };
  }

  if (runtime.geminiDirHost) {
    areas.globalGemini = {
      host: normalizeRuntimeHostPath(runtime.geminiDirHost),
      capsule: path.posix.join(CAPSULE_ROOT, 'home', '.gemini'),
      kind: 'dir',
      readonly: true,
    };
  }

  if (runtime.ghConfigHost) {
    areas.ghConfig = {
      host: normalizeRuntimeHostPath(runtime.ghConfigHost),
      capsule: path.posix.join(CAPSULE_ROOT, 'home', '.config', 'gh'),
      kind: 'dir',
      readonly: true,
    };
  }

  if (runtime.policiesHost) {
    areas.policies = {
      host: normalizeRuntimeHostPath(runtime.policiesHost),
      capsule: path.posix.join(CAPSULE_ROOT, '.gemini', 'policies'),
      kind: 'dir',
      readonly: true,
    };
  }

  if (runtime.entrypointHost) {
    areas.entrypoint = {
      host: normalizeRuntimeHostPath(runtime.entrypointHost),
      capsule: SUPERVISOR_ENTRYPOINT_SOURCE_PATH,
      kind: 'file',
      readonly: true,
    };
  }

  return areas;
}

function normalizeRuntimeHostPath(hostPath: string): string {
  if (/^[A-Z]:/i.test(hostPath)) {
    return path.win32.normalize(hostPath);
  }

  if (path.posix.isAbsolute(hostPath)) {
    return path.posix.normalize(hostPath);
  }

  return path.resolve(hostPath);
}

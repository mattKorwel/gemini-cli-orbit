/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  MissionManifestSchema,
  type StationSupervisorConfig,
} from '../core/types.js';
import { ProcessManager } from '../core/ProcessManager.js';
import { DockerExecutor } from '../core/executors/DockerExecutor.js';
import { GitExecutor } from '../core/executors/GitExecutor.js';
import { WorkspaceManager } from './WorkspaceManager.js';
import { DockerManager } from './DockerManager.js';
import { MissionOrchestrator } from './MissionOrchestrator.js';

/**
 * --- Early Hydration (Station Blueprint) ---
 */
function hydrateConfig(): StationSupervisorConfig {
  const blueprintPath =
    process.argv.find((arg) => arg.startsWith('--config='))?.split('=')[1] ||
    process.env.ORBIT_STATION_CONFIG ||
    '/etc/orbit/station.json';

  let blueprint: any;

  if (!fs.existsSync(blueprintPath)) {
    // Fallback to internal defaults ONLY if we aren't in the expected prod path
    if (blueprintPath === '/etc/orbit/station.json') {
      throw new Error(
        `🛑 CRITICAL: Production Station Blueprint not found at ${blueprintPath}`,
      );
    }

    console.warn(
      `⚠️  Station Blueprint not found at ${blueprintPath}. Using internal defaults.`,
    );
    blueprint = {
      port: 8080,
      useSudo: process.env.USE_SUDO === '1',
      manifestRoot: process.env.ORBIT_MANIFEST_ROOT || '/dev/shm',
      workerImage: 'ghcr.io/mattkorwel/orbit-worker:latest',
      storage: {
        workspacesRoot: '/mnt/disks/data/workspaces',
        mirrorPath: '/mnt/disks/data/main',
      },
      mounts: [
        { host: '/mnt/disks/data', capsule: '/mnt/disks/data' },
        { host: '/dev/shm', capsule: '/dev/shm' },
      ],
      bundlePath: '/usr/local/lib/orbit/bundle',
      isUnlocked: fs.existsSync('/mnt/disks/data/.starfleet-dev-unlocked'),
    };
  } else {
    const raw = fs.readFileSync(blueprintPath, 'utf8');
    blueprint = JSON.parse(raw);
  }

  // Environment overrides (ADR 0015)
  if (process.env.ORBIT_SERVER_PORT)
    blueprint.port = Number(process.env.ORBIT_SERVER_PORT);
  if (process.env.GCLI_ORBIT_WORKER_IMAGE)
    blueprint.workerImage = process.env.GCLI_ORBIT_WORKER_IMAGE;

  // ADR 0020: Enforce absolute paths for Docker stability (Mac/Linux parity)
  blueprint.manifestRoot = path.resolve(blueprint.manifestRoot);
  blueprint.storage.workspacesRoot = path.resolve(
    blueprint.storage.workspacesRoot,
  );
  blueprint.storage.mirrorPath = path.resolve(blueprint.storage.mirrorPath);

  // Resolve all blueprint mounts
  if (blueprint.mounts) {
    blueprint.mounts = blueprint.mounts.map((m: any) => ({
      ...m,
      host: path.resolve(m.host),
    }));
  }

  return blueprint as StationSupervisorConfig;
}

const config = hydrateConfig();

// DEBUG: Persistent log file
const LOG_PATH = path.join(config.storage.workspacesRoot, 'supervisor.log');
const debugLog = (msg: string) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    if (!fs.existsSync(path.dirname(LOG_PATH))) {
      fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    }
    fs.appendFileSync(LOG_PATH, line);
  } catch (e) {
    process.stderr.write(`⚠️ Failed to write to debug log: ${e}\n`);
  }
};

debugLog(`🚀 Station Supervisor starting on port ${config.port}...`);
debugLog(`🚀 Hydration complete: ${JSON.stringify(config, null, 2)}`);

// --- Initialize Components ---
const pm = new ProcessManager({}, config.useSudo);
const dockerExecutor = new DockerExecutor(
  pm,
  config.useSudo ? 'sudo docker' : 'docker',
);
const gitExecutor = new GitExecutor(pm);

const workspace = new WorkspaceManager(gitExecutor, config);
const docker = new DockerManager(dockerExecutor, pm, config);
const orchestrator = new MissionOrchestrator(workspace, docker, config);

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  debugLog(`💥 Uncaught Exception: ${err.stack || err.message}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason);
  debugLog(`💥 Unhandled Rejection: ${reason}`);
});

async function getJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (_e) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

/**
 * Station Supervisor API (Starfleet)
 */
const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  // 1. Health Check
  if (url === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'OK',
        version: '0.0.34-starfleet',
        mode: config.isUnlocked ? 'dev' : 'prod',
      }),
    );
    return;
  }

  // 2. Exec Command (Remote execution on host or in container)
  if (url === '/exec' && method === 'POST') {
    try {
      const { command, options } = await getJsonBody(req);
      const bin = typeof command === 'string' ? command : command.bin;
      const args = typeof command === 'string' ? [] : command.args;

      const execRes = await pm.run(bin, args, options);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: execRes.status,
          stdout: execRes.stdout,
          stderr: execRes.stderr,
        }),
      );
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'EXEC_FAILED', message: err.message }));
    }
    return;
  }

  // 3. Mission Launch (The Order Form)
  if (url === '/missions' && method === 'POST') {
    debugLog('POST /missions - Starting launch');
    try {
      const body = await getJsonBody(req);
      debugLog(`POST /missions - Parsing manifest for ${body.identifier}`);
      const manifest = MissionManifestSchema.parse(body);

      debugLog(`POST /missions - Orchestrating ${manifest.identifier}`);
      const receipt = await orchestrator.orchestrate(manifest);

      debugLog(`POST /missions - Launch successful: ${manifest.identifier}`);
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ACCEPTED', receipt }));
    } catch (err: any) {
      debugLog(`❌ Launch Failure: ${err.message}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'INVALID_ORDER', message: err.message }));
    }
    return;
  }

  // 4. List Active Missions
  if (url === '/missions' && method === 'GET') {
    try {
      const resObj = await pm.run(config.useSudo ? 'sudo docker' : 'docker', [
        'ps',
        '--format',
        '{{.Names}}',
        '--filter',
        'label=orbit-mission',
      ]);
      const capsules = resObj.stdout.trim().split('\n').filter(Boolean);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ capsules }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'LIST_FAILED', message: err.message }));
    }
    return;
  }

  res.writeHead(404).end();
});

server.listen(config.port, '0.0.0.0', () => {
  // TODO: Implement dynamic port mapping and service discovery for multiple instances
  console.log(
    `🚀 Station Supervisor (Starfleet API) on 0.0.0.0:${config.port}`,
  );
  console.log(
    `🔒 Security Status: ${config.isUnlocked ? 'UNRESTRAINED (Dev Mode)' : 'ENFORCED (Production Mode)'}`,
  );
});

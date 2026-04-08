/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import { MissionManifestSchema } from '../core/types.js';
import { ProcessManager } from '../core/ProcessManager.js';
import { DockerExecutor } from '../core/executors/DockerExecutor.js';
import { GitExecutor } from '../core/executors/GitExecutor.js';
import { WorkspaceManager } from './WorkspaceManager.js';
import { DockerManager } from './DockerManager.js';
import { MissionOrchestrator } from './MissionOrchestrator.js';

const PORT = process.env.ORBIT_SERVER_PORT || 8080;
const USE_SUDO = process.env.USE_SUDO === '1';

// --- Initialize Components ---
const pm = new ProcessManager({}, USE_SUDO);
const dockerExecutor = new DockerExecutor(
  pm,
  USE_SUDO ? 'sudo docker' : 'docker',
);
const gitExecutor = new GitExecutor(pm);

const workspace = new WorkspaceManager(gitExecutor);
const docker = new DockerManager(dockerExecutor, pm);
const orchestrator = new MissionOrchestrator(workspace, docker);

async function getJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

/**
 * Station Supervisor: Pure API Routing Layer.
 */
const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  console.log(`[${new Date().toISOString()}] ${method} ${url}`);

  // 1. Health Check
  if (url === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK', version: '0.0.34-starfleet' }));
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
    try {
      const body = await getJsonBody(req);
      const manifest = MissionManifestSchema.parse(body);

      const receipt = await orchestrator.orchestrate(manifest);

      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ACCEPTED', receipt }));
    } catch (err: any) {
      console.error(`❌ Launch Failure: ${err.message}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'INVALID_ORDER', message: err.message }));
    }
    return;
  }

  // 4. List Active Missions
  if (url === '/missions' && method === 'GET') {
    try {
      const resObj = await pm.run(USE_SUDO ? 'sudo docker' : 'docker', [
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Station Supervisor (Starfleet API) on 0.0.0.0:${PORT}`);
});

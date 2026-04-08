/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import { MissionManifestSchema } from '../core/types.js';
import { ProcessManager } from '../core/ProcessManager.js';
import { DockerExecutor } from '../core/executors/DockerExecutor.js';

const PORT = process.env.ORBIT_SERVER_PORT || 8080;
// In Starfleet, the supervisor runs in a container and should NOT use sudo for internal commands.
const USE_SUDO = process.env.USE_SUDO === '1';

const pm = new ProcessManager({}, USE_SUDO);
const docker = new DockerExecutor(pm, USE_SUDO ? 'sudo docker' : 'docker');

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
 * Station Supervisor: Remote orchestration daemon.
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

  // 2. Exec Command (Remote Execution)
  if (url === '/exec' && method === 'POST') {
    try {
      const { command, options } = await getJsonBody(req);
      const bin = typeof command === 'string' ? command : command.bin;
      const args = typeof command === 'string' ? [] : command.args;

      console.log(`🏃 Executing: ${bin} ${args.join(' ')}`);

      let execRes;
      if (options?.isolationId) {
        console.log(`   Isolation: ${options.isolationId}`);
        const dockerCmd = DockerExecutor.exec(options.isolationId, args, {
          ...options,
          bin: bin,
        } as any);
        execRes = await pm.run(
          USE_SUDO ? 'sudo docker' : 'docker',
          dockerCmd.args,
        );
      } else {
        execRes = await pm.run(bin, args, options);
      }

      console.log(`   Result: ${execRes.status}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: execRes.status,
          stdout: execRes.stdout,
          stderr: execRes.stderr,
        }),
      );
    } catch (err: any) {
      console.error(`❌ Exec Error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'EXEC_FAILED', message: err.message }));
    }
    return;
  }

  // 3. Mission Launch
  if (url === '/missions' && method === 'POST') {
    try {
      const body = await getJsonBody(req);
      const manifest = MissionManifestSchema.parse(body);

      console.log(`🚀 Spawning mission: ${manifest.identifier}`);

      const missionImage =
        (manifest as any).image || 'ghcr.io/mattkorwel/gemini-cli-orbit:latest';
      const cmd = docker.run(missionImage, undefined, {
        name: manifest.containerName,
        label: 'orbit-mission',
        mounts: [{ host: manifest.workDir, capsule: '/home/node/dev/main' }],
      });

      const spawnRes = await pm.run(cmd.bin, cmd.args, cmd.options);

      if (spawnRes.status === 0) {
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ACCEPTED',
            container: manifest.containerName,
          }),
        );
      } else {
        console.error(`❌ Spawn Failed: ${spawnRes.stderr}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'SPAWN_FAILED',
            stderr: spawnRes.stderr,
          }),
        );
      }
    } catch (err: any) {
      console.error(`❌ Invalid Manifest: ${err.message}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'INVALID', message: err.message }));
    }
    return;
  }

  // 4. List Missions
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
  console.log(`🚀 Station Supervisor (API Mode) on 0.0.0.0:${PORT}`);
});

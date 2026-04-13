/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
import { StatusAggregator } from './StatusAggregator.js';
import { hydrateStationSupervisorConfig } from './BlueprintHydrator.js';
import { type IProcessManager } from '../core/interfaces.js';
import {
  buildMountAreas,
  resolveCapsulePathFromAreas,
  normalizeCapsulePath,
  resolveHostPathFromAreas,
} from './MountRegistry.js';

export interface StationApiDependencies {
  config: StationSupervisorConfig;
  processManager: IProcessManager;
  dockerExecutor?: DockerExecutor;
  orchestrator?: MissionOrchestrator;
  debugLog?: (msg: string) => void;
}

function resolveWorkspaceHostRoot(config: StationSupervisorConfig): string {
  const mountAreas = buildMountAreas(config.mounts, config.areas);
  return (
    resolveHostPathFromAreas(config.storage.workspacesRoot, mountAreas) ||
    config.storage.workspacesRoot
  );
}

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

export function createDefaultStationDependencies(): StationApiDependencies {
  const config = hydrateStationSupervisorConfig();
  const workspaceHostRoot = resolveWorkspaceHostRoot(config);
  const logPath = path.join(workspaceHostRoot, 'supervisor.log');
  const debugLog = (msg: string) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    process.stdout.write(line);
    try {
      if (!fs.existsSync(path.dirname(logPath))) {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
      }
      fs.appendFileSync(logPath, line);
    } catch (e) {
      process.stderr.write(`⚠️ Failed to write to debug log: ${e}\n`);
    }
  };

  const processManager = new ProcessManager({}, config.useSudo);
  return {
    config,
    processManager,
    debugLog,
  };
}

export function createStationServer(
  dependencies: StationApiDependencies,
): http.Server {
  const { config, processManager, debugLog = () => {} } = dependencies;
  const dockerExecutor =
    dependencies.dockerExecutor ||
    new DockerExecutor(processManager as ProcessManager, 'docker');

  const orchestrator =
    dependencies.orchestrator ||
    new MissionOrchestrator(
      new WorkspaceManager(new GitExecutor(processManager), config),
      new DockerManager(dockerExecutor, processManager, config),
      config,
    );
  const mountAreas = buildMountAreas(config.mounts, config.areas);
  const workspaceHostRoot = resolveWorkspaceHostRoot(config);

  const resolveSupervisorFsPath = (internalPath: string): string => {
    const normalized = normalizeCapsulePath(internalPath);

    // If it's an absolute host path already (e.g. from a mock or win32), return it
    if (path.isAbsolute(normalized) && !normalized.startsWith('/orbit')) {
      return normalized;
    }

    const mapped =
      resolveHostPathFromAreas(normalized, mountAreas) || normalized;

    if (process.platform === 'win32' && mapped !== normalized) {
      return mapped;
    }

    if (
      config.hostRoot &&
      mapped.startsWith(config.hostRoot.replace(/\\/g, '/'))
    ) {
      // If we are in a test environment where hostRoot is a temporary directory,
      // and the mapped path is inside it, it's already a valid host path.
      return mapped;
    }

    if (
      config.manifestRoot &&
      mapped.startsWith(config.manifestRoot.replace(/\\/g, '/'))
    ) {
      return mapped;
    }

    return (
      resolveCapsulePathFromAreas(mapped, buildMountAreas(config.mounts)) ||
      normalized
    );
  };

  const resolveGeminiSettingsPath = (): string => {
    const geminiRoot =
      config.areas?.globalGemini?.capsule ||
      path.posix.join('/orbit', 'home', '.gemini');
    return resolveSupervisorFsPath(
      path.posix.join(geminiRoot, 'settings.json'),
    );
  };

  const getGeminiSettingsHash = (): string | null => {
    const settingsPath = resolveGeminiSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return null;
    }
    const content = fs.readFileSync(settingsPath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  };

  return http.createServer(async (req, res) => {
    const { method, url } = req;
    debugLog(`${method} ${url}`);

    if (url === '/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'OK',
          version: '0.0.34-starfleet',
          semaphore: 'v7',
          mode: config.isUnlocked ? 'dev' : 'prod',
        }),
      );
      return;
    }

    if (url === '/settings/gemini/hash' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ hash: getGeminiSettingsHash() }));
      return;
    }

    if (url === '/settings/gemini' && method === 'PUT') {
      try {
        const body = await getJsonBody(req);
        const content =
          typeof body?.content === 'string' ? body.content : undefined;
        const hash = typeof body?.hash === 'string' ? body.hash : undefined;

        if (!content || !hash) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'INVALID_SETTINGS_PAYLOAD',
              message: 'Expected string content and hash.',
            }),
          );
          return;
        }

        const computedHash = crypto
          .createHash('sha256')
          .update(content)
          .digest('hex');
        if (computedHash !== hash) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'SETTINGS_HASH_MISMATCH',
              message: 'Provided Gemini settings hash does not match content.',
            }),
          );
          return;
        }

        if (getGeminiSettingsHash() === hash) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'UNCHANGED', hash }));
          return;
        }

        const settingsPath = resolveGeminiSettingsPath();
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        fs.writeFileSync(settingsPath, content, 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'UPDATED', hash }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'SETTINGS_SYNC_FAILED',
            message: err.message,
          }),
        );
      }
      return;
    }

    if (url === '/exec' && method === 'POST') {
      try {
        const { command, options } = await getJsonBody(req);
        const bin = typeof command === 'string' ? command : command.bin;
        const args = typeof command === 'string' ? [] : command.args;
        const execRes = await processManager.run(bin, args, options);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: execRes.status,
            stdout: execRes.stdout,
            stderr: execRes.stderr,
          }),
        );
      } catch (err: any) {
        console.error(`❌ POST /exec Error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'EXEC_FAILED',
            message: err.message,
            stack: err.stack,
          }),
        );
      }
      return;
    }

    if (url === '/missions' && method === 'POST') {
      debugLog('POST /missions - Starting launch');
      let body: any;
      let manifest: any;

      try {
        body = await getJsonBody(req);
        debugLog(`POST /missions - Parsing manifest for ${body.identifier}`);
        manifest = MissionManifestSchema.parse(body);

        debugLog(`POST /missions - Orchestrating ${manifest.identifier}`);
        const receipt = await orchestrator.orchestrate(manifest);

        debugLog(`POST /missions - Launch successful: ${manifest.identifier}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'READY', receipt }));
      } catch (err: any) {
        debugLog(`❌ Launch Failure: ${err.message}`);

        let detail = err.message;
        if (manifest?.containerName) {
          try {
            const cmd = dockerExecutor.logs(manifest.containerName, {
              tail: '100',
            });
            const logRes = await processManager.run(
              cmd.bin,
              cmd.args,
              cmd.options,
            );
            detail += `\n--- Container Logs ---\n${logRes.stdout}${logRes.stderr}`;
          } catch (_logErr) {
            // Best effort only
          }
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ error: 'MISSION_LAUNCH_FAILED', message: detail }),
        );
      }
      return;
    }

    if (url === '/missions' && method === 'GET') {
      try {
        const cmd = dockerExecutor.ps({
          format: '{{.Names}}',
          filter: 'label=orbit-mission',
        });
        const resObj = await processManager.run(cmd.bin, cmd.args, cmd.options);
        const capsules = resObj.stdout.trim().split('\n').filter(Boolean);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ capsules }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LIST_FAILED', message: err.message }));
      }
      return;
    }

    if (url === '/missions/status' && method === 'GET') {
      try {
        const aggregator = new StatusAggregator(workspaceHostRoot);
        const status = await aggregator.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ error: 'STATUS_FAILED', message: err.message }),
        );
      }
      return;
    }

    if (url?.startsWith('/missions/') && method === 'DELETE') {
      const parts = url.split('/');
      const capsuleName = parts[2];
      try {
        debugLog(`DELETE /missions/${capsuleName} - Jettisoning mission`);
        // Note: For now, we delegate to a basic container removal.
        // In the future, this can trigger deeper workspace cleanup via orchestrator.
        const cmd = dockerExecutor.rm(capsuleName!, { force: true });
        await processManager.run(cmd.bin, cmd.args, cmd.options);

        res.writeHead(204).end();
      } catch (err: any) {
        debugLog(`❌ DELETE /missions/${capsuleName} Failure: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ error: 'JETTISON_FAILED', message: err.message }),
        );
      }
      return;
    }

    if (
      url?.startsWith('/missions/') &&
      url?.endsWith('/logs') &&
      method === 'GET'
    ) {
      const capsuleName = url.split('/')[2];
      try {
        const cmd = dockerExecutor.logs(capsuleName!, { tail: '100' });
        const resObj = await processManager.run(cmd.bin, cmd.args, cmd.options);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ logs: resObj.stdout + resObj.stderr }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'LOGS_FAILED', message: err.message }));
      }
      return;
    }

    res.writeHead(404).end();
  });
}

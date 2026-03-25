/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'node:path';
import fs from 'node:fs';

import { ProviderFactory } from './providers/ProviderFactory.ts';


const REPO_ROOT = process.cwd();

export async function runStatus(env: NodeJS.ProcessEnv = process.env) {
  const settingsPath = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');
  if (!fs.existsSync(settingsPath)) {
    console.error('❌ Settings not found. Run "workspace setup" first.');
    return 1;
  }
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.workspace;
  if (!config) {
    console.error('❌ Deep Review configuration not found.');
    return 1;
  }

  const { projectId, zone } = config;
  const targetVM = `gcli-workspace-${env.USER || 'mattkorwel'}`;
  const provider = ProviderFactory.getProvider({
    projectId,
    zone,
    instanceName: targetVM,
  });

  console.log(`\n🛰️  Workspace Mission Control: ${targetVM}`);
  console.log(
    `--------------------------------------------------------------------------------`,
  );

  const status = await provider.getStatus();
  console.log(`   - VM State:   ${status.status}`);
  console.log(`   - Internal IP: ${status.internalIp || 'N/A'}`);
  if (status.externalIp) {
    console.log(`   - External IP: ${status.externalIp}`);
  }

  if (status.status === 'RUNNING') {
    console.log(`\n🧵 Active Sessions (Containers):`);
    
    // Find all containers starting with 'gcli-'
    const containerRes = await provider.getExecOutput("sudo docker ps --format '{{.Names}}' | grep '^gcli-'", { quiet: true });
    
    if (containerRes.status === 0 && containerRes.stdout.trim()) {
      const containers = containerRes.stdout.trim().split('\n');
      for (const containerName of containers) {
          const tmuxRes = await provider.getExecOutput('tmux list-sessions -F "#S" 2>/dev/null', { wrapContainer: containerName, quiet: true });
          if (tmuxRes.status === 0 && tmuxRes.stdout.trim()) {
              const sessions = tmuxRes.stdout.trim().split('\n');
              sessions.forEach(s => console.log(`     ✅ [${containerName}] ${s}`));
          } else {
              console.log(`     🔹 [${containerName}] (No active tmux sessions)`);
          }
      }
    } else {
      console.log('     - No active workspace containers found');
    }
  }

  console.log(
    `--------------------------------------------------------------------------------\n`,
  );
  return 0;
}

runStatus().catch(console.error);

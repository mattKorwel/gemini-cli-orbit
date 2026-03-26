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

  const { projectId, zone, dnsSuffix, userSuffix, backendType } = config;
  const targetVM = `gcli-workspace-${env.USER || 'gcli-user'}`;
  const provider = ProviderFactory.getProvider({
    projectId,
    zone,
    instanceName: targetVM,
    dnsSuffix,
    userSuffix,
    backendType
  });

  const statusRes = await provider.getStatus();
  if (statusRes.status === 'UNKNOWN' || statusRes.status === 'ERROR') {
      console.error(`❌ Worker ${targetVM} is in an invalid state: ${statusRes.status}`);
      return 1;
  }

  console.log(`\n🛰️  Workspace Mission Control: ${targetVM}`);
  console.log(
    `--------------------------------------------------------------------------------`,
  );

  console.log(`   - VM State:   ${statusRes.status}`);
  console.log(`   - Internal IP: ${statusRes.internalIp || 'N/A'}`);
  if (statusRes.externalIp) {
    console.log(`   - External IP: ${statusRes.externalIp}`);
  }

  if (statusRes.status === 'RUNNING') {
    console.log(`\n📦 Active Workspace Environments:`);
    
    // Find all containers starting with 'gcli-'
    const containerRes = await provider.getExecOutput("sudo docker ps --format '{{.Names}}' | grep '^gcli-'", { quiet: true });
    
    if (containerRes.status === 0 && containerRes.stdout.trim()) {
      const containers = containerRes.stdout.trim().split('\n');
      for (const containerName of containers) {
          const tmuxRes = await provider.getExecOutput('tmux list-sessions -F "#S" 2>/dev/null', { wrapContainer: containerName, quiet: true });
          if (tmuxRes.status === 0 && tmuxRes.stdout.trim()) {
              // HEURISTIC: Capture pane to see what's happening
              const paneOutput = await provider.capturePane(containerName);
              const lines = paneOutput.trim().split('\n');
              const lastLine = lines[lines.length - 1] || '';
              const lastTwoLines = lines.slice(-2).join(' ');
              
              // More robust waiting detection
              const isWaiting = 
                lastLine.includes(' > ') ||                // Standard prompt
                lastLine.trim().endsWith('>') ||           // Minimal prompt
                lastTwoLines.includes('(y/n)') ||          // Approvals
                lastLine.trim().endsWith('?') ||           // Questions
                lastLine.includes('node@') && lastLine.includes('$'); // Shell prompt
              
              if (isWaiting) {
                  console.log(`     ✋ [WAITING] ${containerName} (Needs your input!)`);
              } else {
                  console.log(`     🧠 [THINKING] ${containerName} (Agent is active)`);
              }
          } else {
              console.log(`     💤 [IDLE]     ${containerName} (Ready for work)`);
          }
      }
    } else {
      console.log('     - No workspace environments found');
    }
  }

  console.log(
    `--------------------------------------------------------------------------------\n`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStatus().then(code => process.exit(code || 0)).catch(err => {
      console.error(err);
      process.exit(1);
  });
}

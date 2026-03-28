/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface Task {
  id: string;
  name: string;
  cmd: string;
  dep?: string;
}

export interface TaskStatus {
  id: string;
  name: string;
  state: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  exitCode?: number;
  logPath: string;
}

export function createTaskRunner(logDir: string, header: string) {
  const tasks: Task[] = [];
  const status: Record<string, TaskStatus> = {};

  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    // Ignore if exists
  }

  return {
    register(newTasks: Task[]) {
      newTasks.forEach(task => {
        tasks.push(task);
        status[task.id] = {
          id: task.id,
          name: task.name,
          state: 'pending',
          logPath: path.join(logDir, `${task.id}.log`)
        };
      });
    },

    async run(cmd: string): Promise<number> {
      console.log(`\n🏃 Running: ${cmd}`);
      const res = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
      return res.status ?? 0;
    },

    /**
     * Legacy sequential execution
     */
    async runAll(): Promise<number> {
      console.log(`\n${header}`);
      console.log('='.repeat(50));
      
      for (const task of tasks) {
        console.log(`\n▶️  Task: ${task.name}`);
        const res = spawnSync('sh', ['-c', task.cmd], { stdio: 'inherit' });
        if (res.status !== 0) {
            console.error(`\n❌ Task Failed: ${task.name}`);
            return res.status ?? 1;
        }
      }

      console.log('\n✨ All tasks complete.');
      console.log('='.repeat(50));
      return 0;
    },

    async runParallel(): Promise<number> {
      console.log(`\n${header}`);
      console.log('='.repeat(50));

      const runningTasks: Promise<void>[] = [];
      const completedIds = new Set<string>();

      const launchTask = (task: Task) => {
        const taskStatus = status[task.id];
        
        // Check dependency
        if (task.dep && !completedIds.has(task.dep)) {
           return;
        }

        if (taskStatus.state !== 'pending') return;

        taskStatus.state = 'running';
        const logStream = fs.createWriteStream(taskStatus.logPath);
        
        const proc = spawn('sh', ['-c', task.cmd], { 
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, FORCE_COLOR: '1' }
        });

        proc.stdout.pipe(logStream);
        proc.stderr.pipe(logStream);

        const promise = new Promise<void>((resolve) => {
          proc.on('close', (code) => {
            taskStatus.exitCode = code ?? 0;
            taskStatus.state = code === 0 ? 'success' : 'failed';
            completedIds.add(task.id);
            resolve();
          });
        });

        runningTasks.push(promise);
      };

      // Main scheduling loop
      while (Object.values(status).some(s => s.state === 'pending' || s.state === 'running')) {
        tasks.forEach(launchTask);
        
        // Update UI
        this.renderStatus();
        
        // Check for dependency failures
        tasks.forEach(task => {
            if (task.dep && status[task.dep].state === 'failed' && status[task.id].state === 'pending') {
                status[task.id].state = 'skipped';
            }
        });

        await new Promise(r => setTimeout(r, 2000));
      }

      await Promise.all(runningTasks);
      this.renderStatus();

      const anyFailed = Object.values(status).some(s => s.state === 'failed');
      console.log(`\n${anyFailed ? '❌ Some tasks failed.' : '✨ All tasks complete.'}`);
      console.log('='.repeat(50));
      
      return anyFailed ? 1 : 0;
    },

    renderStatus() {
      process.stdout.write('\x1b[2J\x1b[0f');
      console.log(`\n${header}`);
      console.log('='.repeat(50));
      
      Object.values(status).forEach(s => {
        let icon = '⏳';
        if (s.state === 'success') icon = '✅';
        if (s.state === 'failed') icon = '❌';
        if (s.state === 'running') icon = '▶️ ';
        if (s.state === 'skipped') icon = '➖';
        
        const exitPart = s.exitCode !== undefined ? ` (exit ${s.exitCode})` : '';
        console.log(`${icon} [${s.id}] ${s.name}: ${s.state.toUpperCase()}${exitPart}`);
      });
      
      console.log('\n' + '='.repeat(50));
    }
  };
}

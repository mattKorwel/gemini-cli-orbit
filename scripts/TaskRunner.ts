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
  timeout?: number; // Timeout in milliseconds
}

export interface TaskStatus {
  id: string;
  name: string;
  state: 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'timeout';
  exitCode?: number;
  logPath: string;
  lastLogLines?: string[];
}

export function createTaskRunner(logDir: string, header: string) {
  const tasks: Task[] = [];
  const status: Record<string, TaskStatus> = {};
  const logHistory: { taskId: string; line: string }[] = [];

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
          logPath: path.join(logDir, `${task.id}.log`),
          lastLogLines: []
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

      const runningTasks: Map<string, { proc: any; timer: NodeJS.Timeout; lastReadPos: number }> = new Map();
      const completedIds = new Set<string>();

      const launchTask = (task: Task) => {
        const taskStatus = status[task.id]!;
        
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

        const timer = setTimeout(() => {
          if (runningTasks.has(task.id)) {
            proc.kill('SIGKILL');
            taskStatus.state = 'timeout';
            completedIds.add(task.id);
            runningTasks.delete(task.id);
          }
        }, task.timeout || 300000); // Default 5 minute timeout

        runningTasks.set(task.id, { proc, timer, lastReadPos: 0 });

        proc.on('close', (code) => {
          if (taskStatus.state === 'running') {
            clearTimeout(timer);
            taskStatus.exitCode = code ?? 0;
            taskStatus.state = code === 0 ? 'success' : 'failed';
            completedIds.add(task.id);
            runningTasks.delete(task.id);
          }
        });
      };

      // Main scheduling loop
      while (Object.values(status).some(s => s.state === 'pending' || s.state === 'running')) {
        tasks.forEach(launchTask);
        
        // Incremental Log Tailing for Live View
        Object.values(status).forEach(s => {
          if (fs.existsSync(s.logPath)) {
             const rt = runningTasks.get(s.id);
             const stats = fs.statSync(s.logPath);
             const start = rt ? rt.lastReadPos : 0;
             
             if (stats.size > start) {
                const fd = fs.openSync(s.logPath, 'r');
                const buffer = Buffer.alloc(stats.size - start);
                fs.readSync(fd, buffer, 0, buffer.length, start);
                fs.closeSync(fd);
                
                const newContent = buffer.toString('utf8');
                const newLines = newContent.split('\n').filter(l => l.trim());
                
                newLines.forEach(line => {
                  logHistory.push({ taskId: s.id, line });
                });
                
                if (rt) rt.lastReadPos = stats.size;
                // Keep only last 100 global lines for memory efficiency
                if (logHistory.length > 100) logHistory.splice(0, logHistory.length - 100);
             }
          }
        });

        // Update UI
        this.renderStatus();
        
        // Check for dependency failures
        tasks.forEach(task => {
            if (task.dep && (status[task.dep]!.state === 'failed' || status[task.dep]!.state === 'timeout' || status[task.dep]!.state === 'skipped') && status[task.id]!.state === 'pending') {
                status[task.id]!.state = 'skipped';
            }
        });

        await new Promise(r => setTimeout(r, 1000));
      }

      this.renderStatus();

      const anyFailed = Object.values(status).some(s => s.state === 'failed' || s.state === 'timeout');
      console.log(`\n${anyFailed ? '❌ Some tasks failed or timed out.' : '✨ All tasks complete.'}`);
      console.log('='.repeat(50));
      
      return anyFailed ? 1 : 0;
    },

    renderStatus() {
      // Clear screen and reset cursor
      process.stdout.write('\x1b[2J\x1b[H');

      console.log(`\n${header}`);
      console.log('='.repeat(50));

      Object.values(status).forEach(s => {
        let icon = '⏳';
        if (s.state === 'success') icon = '✅';
        if (s.state === 'failed') icon = '❌';
        if (s.state === 'running') icon = '▶️ ';
        if (s.state === 'skipped') icon = '➖';
        if (s.state === 'timeout') icon = '⏰';

        const exitPart = s.exitCode !== undefined ? ` (exit ${s.exitCode})` : '';
        console.log(`${icon} [${s.id}] ${s.name}: ${s.state.toUpperCase()}${exitPart}`);
      });

      console.log('\n' + '='.repeat(50));
      console.log(`💡 Tip: To stream all logs, run: tail -f ${logDir}/*.log`);
      console.log('='.repeat(50));
    }  };
}

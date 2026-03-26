/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'child_process';
import fs from 'fs';

export interface Task {
  id: string;
  name: string;
  cmd: string;
  dep?: string;
}

export function createTaskRunner(logDir: string, header: string) {
  const tasks: Task[] = [];

  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (e) {
    // Ignore if exists
  }

  return {
    register(newTasks: Task[]) {
      tasks.push(...newTasks);
    },

    async run(cmd: string): Promise<number> {
      console.log(`\n🏃 Running: ${cmd}`);
      const res = spawnSync('sh', ['-c', cmd], { stdio: 'inherit' });
      return res.status ?? 0;
    },

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
    }
  };
}

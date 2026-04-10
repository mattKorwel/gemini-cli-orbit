/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProcessManager } from '../core/ProcessManager.js';
import { TestProcessManager } from './TestProcessManager.js';

/**
 * StarfleetHarness: A specialized test harness for verifying Starfleet activities.
 * Provides a real filesystem sandbox and intercepts spawned commands via a scoped binDir.
 */
export class StarfleetHarness {
  public readonly root: string;
  public readonly bin: string;
  public readonly historyFile: string;

  constructor(suiteName: string) {
    this.root = fs.mkdtempSync(
      path.join(os.tmpdir(), `orbit-test-${suiteName}-`),
    );
    this.bin = path.join(this.root, 'bin');
    this.historyFile = path.join(this.root, 'spawn-history.log');

    fs.mkdirSync(this.bin, { recursive: true });
    fs.writeFileSync(this.historyFile, '');
  }

  /**
   * Creates a programmable binary stub in the sandbox bin directory.
   */
  public stubScript(binName: string, scriptBody: string): void {
    const programPath = path.join(this.bin, `${binName}.js`);
    const sharedPreamble = `
const fs = require('node:fs');
const path = require('node:path');
const historyFile = ${JSON.stringify(this.historyFile)};
const root = ${JSON.stringify(this.root)};
const args = process.argv.slice(2);
const cwd = process.cwd();
fs.appendFileSync(historyFile, \`[\${cwd}] ${binName} \${args.join(' ')}\\n\`);
`;
    fs.writeFileSync(programPath, `${sharedPreamble}\n${scriptBody}\n`, {
      mode: 0o755,
    });
  }

  /**
   * Creates a simple success/failure stub.
   */
  public stub(binName: string, response = '', exitCode = 0): void {
    this.stubScript(
      binName,
      `
if (${JSON.stringify(response)}) {
  process.stdout.write(${JSON.stringify(response)} + '\\n');
}
process.exit(${exitCode});
`,
    );
  }

  /**
   * Returns a ProcessManager that resolves binaries from the harness bin dir first.
   */
  public createProcessManager(useSudo = false): TestProcessManager {
    return new TestProcessManager(new ProcessManager({}, useSudo), {
      binDir: this.bin,
    });
  }

  /**
   * Returns the history of spawned commands.
   */
  public getHistory(): string[] {
    if (!fs.existsSync(this.historyFile)) return [];
    return fs
      .readFileSync(this.historyFile, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '');
  }

  /**
   * Cleans up the sandbox.
   */
  public cleanup(): void {
    if (!fs.existsSync(this.root)) {
      return;
    }

    const deadline = Date.now() + 3000;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        fs.rmSync(this.root, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 50,
        });
        return;
      } catch (error) {
        lastError = error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }

    if (fs.existsSync(this.root)) {
      throw lastError;
    }
  }

  /**
   * Creates a file in the sandbox.
   */
  public writeFile(relPath: string, content: string): string {
    const fullPath = path.join(this.root, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  }

  /**
   * Reads a file from the sandbox.
   */
  public readFile(relPath: string): string {
    const fullPath = path.join(this.root, relPath);
    return fs.readFileSync(fullPath, 'utf8');
  }

  /**
   * Returns the absolute path for a relative path in the sandbox.
   */
  public resolve(relPath: string): string {
    return path.join(this.root, relPath);
  }
}

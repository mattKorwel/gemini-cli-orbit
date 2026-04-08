/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * StarfleetHarness: A specialized test harness for verifying Starfleet activities.
 * Provides a real filesystem sandbox and intercepts spawned commands via PATH hijacking.
 */
export class StarfleetHarness {
  public readonly root: string;
  public readonly bin: string;
  public readonly historyFile: string;
  private readonly originalPath: string | undefined;

  constructor(suiteName: string) {
    this.root = fs.mkdtempSync(
      path.join(os.tmpdir(), `orbit-test-${suiteName}-`),
    );
    this.bin = path.join(this.root, 'bin');
    this.historyFile = path.join(this.root, 'spawn-history.log');
    this.originalPath = process.env.PATH;

    fs.mkdirSync(this.bin, { recursive: true });
    fs.writeFileSync(this.historyFile, '');
  }

  /**
   * Hijacks a binary by creating a stub in the sandbox bin directory.
   */
  public stub(binName: string, response = '', exitCode = 0): void {
    const stubPath = path.join(this.bin, binName);
    const content = `#!/bin/sh
echo "[$(pwd)] ${binName} $@" >> "${this.historyFile}"
${response ? `echo "${response}"` : ''}
exit ${exitCode}
`;
    fs.writeFileSync(stubPath, content, { mode: 0o755 });
  }

  /**
   * Activates the harness by modifying the process PATH.
   */
  public activate(): void {
    process.env.PATH = `${this.bin}${path.delimiter}${this.originalPath}`;
  }

  /**
   * Deactivates the harness by restoring the process PATH.
   */
  public deactivate(): void {
    process.env.PATH = this.originalPath;
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
    this.deactivate();
    if (fs.existsSync(this.root)) {
      fs.rmSync(this.root, { recursive: true, force: true });
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

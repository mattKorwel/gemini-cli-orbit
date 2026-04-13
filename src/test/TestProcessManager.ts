/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import fs from 'node:fs';
import {
  type IProcessManager,
  type IProcessResult,
  type IRunOptions,
} from '../core/interfaces.js';

interface TestProcessManagerOptions {
  binDir: string;
}

export class TestProcessManager implements IProcessManager {
  constructor(
    private readonly inner: IProcessManager,
    private readonly options: TestProcessManagerOptions,
  ) {}

  private resolve(
    bin: string,
    args: string[],
  ): { bin: string; args: string[] } {
    let baseBin = bin;

    if (path.isAbsolute(bin)) {
      if (!bin.startsWith(this.options.binDir)) {
        return { bin, args };
      }
      baseBin = path.basename(bin);
    }

    // Strip .exe for stub resolution
    if (baseBin.toLowerCase().endsWith('.exe')) {
      baseBin = baseBin.slice(0, -4);
    }

    // Try finding the stub with or without .js extension (harness.stubScript adds .js)
    const scriptPath = path.join(this.options.binDir, `${baseBin}.js`);
    if (!fs.existsSync(scriptPath)) {
      return { bin, args };
    }
    return {
      bin: process.execPath,
      args: [scriptPath, ...args],
    };
  }

  runSync(bin: string, args: string[], options?: IRunOptions): IProcessResult {
    const resolved = this.resolve(bin, args);
    return this.inner.runSync(resolved.bin, resolved.args, options);
  }

  run(
    bin: string,
    args: string[],
    options?: IRunOptions,
  ): Promise<IProcessResult> {
    const resolved = this.resolve(bin, args);
    return this.inner.run(resolved.bin, resolved.args, options);
  }

  runAsync(
    bin: string,
    args: string[],
    options?: IRunOptions,
  ): import('node:child_process').ChildProcess {
    const resolved = this.resolve(bin, args);
    return this.inner.runAsync(resolved.bin, resolved.args, options);
  }

  spawn(
    bin: string,
    args: string[],
    options?: IRunOptions,
  ): import('node:child_process').ChildProcess {
    const resolved = this.resolve(bin, args);
    return this.inner.spawn(resolved.bin, resolved.args, options);
  }
}

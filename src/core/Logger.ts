/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { getOrbitLogPath, getProjectOrbitDir } from './Constants.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private verbose: boolean = false;
  private logStream: fs.WriteStream | null = null;
  private repoRoot: string = process.cwd();

  /**
   * Updates the repo root for logging.
   */
  setRepoRoot(repoRoot: string) {
    if (this.repoRoot !== repoRoot) {
      this.repoRoot = repoRoot;
      if (this.logStream) {
        this.logStream.end();
        this.logStream = null;
      }
    }
  }

  private ensureInitialized() {
    if (this.logStream) return;

    const orbitDir = getProjectOrbitDir(this.repoRoot);
    const logPath = getOrbitLogPath(this.repoRoot);

    if (!fs.existsSync(orbitDir)) {
      fs.mkdirSync(orbitDir, { recursive: true });
    }
    this.logStream = fs.createWriteStream(logPath, { flags: 'a' });
  }

  setVerbose(verbose: boolean) {
    this.verbose = verbose;
  }

  private formatMessage(level: LogLevel, tag: string, message: string): string {
    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level].padEnd(5);
    const tagStr = `[${tag}]`.padEnd(10);
    return `[${timestamp}] ${levelStr} ${tagStr} ${message}`;
  }

  private write(level: LogLevel, tag: string, message: string, ...args: any[]) {
    this.ensureInitialized();
    const formatted = this.formatMessage(level, tag, message);
    const fullMessage =
      args.length > 0 ? `${formatted} ${JSON.stringify(args)}` : formatted;

    if (this.logStream) {
      this.logStream.write(fullMessage + '\n');
    }

    const isMcp = !!process.env.GCLI_MCP;

    if (level === LogLevel.ERROR) {
      console.error(`[ERROR] ${tagStr(tag)}${message}`, ...args);
    } else if (level === LogLevel.WARN) {
      console.warn(`[WARN ] ${tagStr(tag)}${message}`, ...args);
    } else if (
      level === LogLevel.INFO ||
      (level === LogLevel.DEBUG && this.verbose)
    ) {
      const displayLevel = level === LogLevel.DEBUG ? '[DEBUG]' : '[INFO ]';
      if (isMcp) {
        console.error(`${displayLevel} ${tagStr(tag)}${message}`, ...args);
      } else {
        console.log(`${displayLevel} ${tagStr(tag)}${message}`, ...args);
      }
    }
  }

  info(tag: string, message?: string, ...args: any[]) {
    if (message === undefined) {
      this.write(LogLevel.INFO, 'GENERAL', tag, ...args);
    } else {
      this.write(LogLevel.INFO, tag, message, ...args);
    }
  }

  debug(tag: string, message?: string, ...args: any[]) {
    if (message === undefined) {
      this.write(LogLevel.DEBUG, 'GENERAL', tag, ...args);
    } else {
      this.write(LogLevel.DEBUG, tag, message, ...args);
    }
  }

  warn(tag: string, message?: string, ...args: any[]) {
    if (message === undefined) {
      this.write(LogLevel.WARN, 'GENERAL', tag, ...args);
    } else {
      this.write(LogLevel.WARN, tag, message, ...args);
    }
  }

  error(tag: string, message?: string, ...args: any[]) {
    if (message === undefined) {
      this.write(LogLevel.ERROR, 'GENERAL', tag, ...args);
    } else {
      this.write(LogLevel.ERROR, tag, message, ...args);
    }
  }

  divider(title?: string) {
    const line = '-'.repeat(80);
    if (title) {
      const padding = Math.max(0, Math.floor((80 - title.length - 2) / 2));
      const centered = `${'-'.repeat(padding)} ${title} ${'-'.repeat(80 - padding - title.length - 2)}`;
      this.info('SETUP', centered);
    } else {
      this.info('SETUP', line);
    }
  }

  logOutput(stdout: string | Buffer, stderr: string | Buffer) {
    if (stdout && stdout.toString().trim()) {
      this.debug('STDOUT', stdout.toString().trim());
    }
    if (stderr && stderr.toString().trim()) {
      this.debug('STDERR', stderr.toString().trim());
    }
  }
}

function tagStr(tag: string): string {
  return tag ? `[${tag.padEnd(8)}] ` : '';
}

export const logger = new Logger();

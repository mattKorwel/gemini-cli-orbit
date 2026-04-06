/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, LogLevel, ConsoleObserver } from './Logger.js';

describe('Logger Verbosity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not log DEBUG messages by default', () => {
    logger.setVerbose(false);
    logger.debug('TEST', 'Debug message');
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG]'),
    );
  });

  it('should log DEBUG messages when verbose is true', () => {
    logger.setVerbose(true);
    logger.debug('TEST', 'Debug message');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG]'),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Debug message'),
    );
  });

  it('should log INFO messages regardless of verbose setting', () => {
    logger.setVerbose(false);
    logger.info('TEST', 'Info message');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[INFO ]'),
    );
  });
});

describe('ConsoleObserver Verbosity', () => {
  let observer: ConsoleObserver;

  beforeEach(() => {
    observer = new ConsoleObserver();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not log DEBUG messages by default', () => {
    observer.setVerbose!(false);
    observer.onLog(LogLevel.DEBUG, 'TEST', 'Debug message');
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG]'),
    );
  });

  it('should log DEBUG messages when verbose is enabled', () => {
    observer.setVerbose!(true);
    observer.onLog(LogLevel.DEBUG, 'TEST', 'Debug message');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG]'),
    );
  });
});

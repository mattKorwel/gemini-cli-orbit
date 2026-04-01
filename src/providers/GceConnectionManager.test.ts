/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { GceConnectionManager } from './GceConnectionManager.js';

describe('GceConnectionManager', () => {
  const mockConfig = {
    repoName: 'test-repo',
    projectId: 'test-project',
    zone: 'us-central1-a',
    instanceName: 'test-instance',
    upstreamRepo: 'google/test-repo',
  };

  it('should default to direct-internal strategy', () => {
    const manager = new GceConnectionManager(
      'test-project',
      'us-central1-a',
      'test-instance',
      mockConfig,
    );
    const cmd = manager.getRunCommand('ls');
    expect(cmd).toContain(
      'nic0.test-instance.us-central1-a.c.test-project.internal',
    );
  });

  it('should use external strategy when specified', () => {
    const manager = new GceConnectionManager(
      'test-project',
      'us-central1-a',
      'test-instance',
      { ...mockConfig, backendType: 'external' },
    );
    const cmd = manager.getRunCommand('ls');
    // External uses gcloud compute ssh <name> without nic0 prefix
    expect(cmd).toContain('gcloud --verbosity=error compute ssh test-instance');
    expect(cmd).not.toContain('nic0');
  });

  it('should generate rsync ssh args for direct-internal', () => {
    const manager = new GceConnectionManager(
      'test-project',
      'us-central1-a',
      'test-instance',
      mockConfig,
    );
    const arg = manager.getRsyncSshArg();
    expect(arg).toContain('StrictHostKeyChecking=no');
  });
});

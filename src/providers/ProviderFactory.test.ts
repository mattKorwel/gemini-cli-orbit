/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ProviderFactory } from './ProviderFactory.js';
import { StarfleetProvider } from './StarfleetProvider.js';
import {
  type ProjectContext,
  type InfrastructureSpec,
} from '../core/Constants.js';

describe('ProviderFactory', () => {
  const projectCtx: ProjectContext = {
    repoRoot: '/local/repo',
    repoName: 'test-repo',
  };

  const mockPm: any = {
    runSync: vi.fn(),
  };
  const mockExecutors: any = {
    ssh: {},
  };

  it('should return a StarfleetProvider instance by default for GCE', () => {
    const infra: InfrastructureSpec = {
      projectId: 'test-project',
      zone: 'us-central1-a',
      instanceName: 'test-instance',
    };

    const factory = new ProviderFactory(mockPm, mockExecutors);
    const provider = factory.getProvider(projectCtx, infra);
    expect(provider).toBeInstanceOf(StarfleetProvider);
  });
});

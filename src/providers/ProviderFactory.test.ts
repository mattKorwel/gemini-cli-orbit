/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ProviderFactory } from './ProviderFactory.js';
import { GceCosProvider } from './GceCosProvider.js';
import {
  type ProjectContext,
  type InfrastructureSpec,
} from '../core/Constants.js';

describe('ProviderFactory', () => {
  it('should return a GceCosProvider instance', () => {
    const projectCtx: ProjectContext = {
      repoRoot: '/local/repo',
      repoName: 'test-repo',
    };
    const infra: InfrastructureSpec = {
      projectId: 'test-project',
      zone: 'us-central1-a',
      instanceName: 'test-instance',
    };

    const mockPm: any = {};
    const mockExecutors: any = {};
    const factory = new ProviderFactory(mockPm, mockExecutors);
    const provider = factory.getProvider(projectCtx, infra);
    expect(provider).toBeInstanceOf(GceCosProvider);
  });
});

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ProviderFactory } from './ProviderFactory.js';
import { GceCosProvider } from './GceCosProvider.js';

describe('ProviderFactory', () => {
  it('should return a GceCosProvider instance', () => {
    const config = {
      projectId: 'test-project',
      zone: 'us-central1-a',
      instanceName: 'test-instance',
    };

    const provider = ProviderFactory.getProvider(config);
    expect(provider).toBeInstanceOf(GceCosProvider);
  });
});

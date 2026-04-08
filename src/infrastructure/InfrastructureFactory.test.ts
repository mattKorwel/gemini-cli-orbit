/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { InfrastructureFactory } from './InfrastructureFactory.js';
import { GcpCosTarget } from './targets/GcpCosTarget.js';
import { LocalNoopTarget } from './targets/LocalNoopTarget.js';
import { type OrbitConfig } from '../core/Constants.js';

describe('InfrastructureFactory', () => {
  const factory = new InfrastructureFactory();

  it('should return GcpCosTarget when providerType is gce', () => {
    const config: OrbitConfig = { providerType: 'gce' };
    const provisioner = factory.getProvisioner('test', config);
    expect(provisioner).toBeInstanceOf(GcpCosTarget);
  });

  it('should return LocalNoopTarget when providerType is local-worktree', () => {
    const config: OrbitConfig = { providerType: 'local-worktree' };
    const provisioner = factory.getProvisioner('test', config);
    expect(provisioner).toBeInstanceOf(LocalNoopTarget);
  });

  it('should default to gce when providerType is missing', () => {
    const config: OrbitConfig = {};
    const provisioner = factory.getProvisioner('test', config);
    expect(provisioner).toBeInstanceOf(GcpCosTarget);
  });

  it('should respect legacy "type" field when providerType is missing (StationReceipt support)', () => {
    // This simulates passing a StationReceipt (which has .type) as an OrbitConfig
    const receiptAsConfig = {
      type: 'local-worktree',
    } as any as OrbitConfig;

    const provisioner = factory.getProvisioner('test', receiptAsConfig);
    expect(provisioner).toBeInstanceOf(LocalNoopTarget);
  });

  it('should return GcpCosTarget when legacy type is gce and providerType is missing', () => {
    const receiptAsConfig = {
      type: 'gce',
    } as any as OrbitConfig;

    const provisioner = factory.getProvisioner('test', receiptAsConfig);
    expect(provisioner).toBeInstanceOf(GcpCosTarget);
  });
});

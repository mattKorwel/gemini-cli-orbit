/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InfrastructureProvisioner } from '../InfrastructureProvisioner.js';
import type { InfrastructureState } from '../InfrastructureState.js';

/**
 * A mock provisioner for testing the PNI handover logic.
 * Simulates a successful Pulumi run without requiring the binary.
 */
export class MockGcpTarget implements InfrastructureProvisioner {
  public readonly id: string;

  constructor(schematicName: string) {
    this.id = `mock-gcp-${schematicName}`;
  }

  async up(): Promise<InfrastructureState> {
    console.log(`   [MOCK] 🚀 Simulating Pulumi up for ${this.id}...`);
    return this.getState();
  }

  async down(): Promise<void> {
    console.log(`   [MOCK] 🔥 Simulating Pulumi destroy for ${this.id}...`);
  }

  async refresh(): Promise<InfrastructureState> {
    return this.getState();
  }

  async getState(): Promise<InfrastructureState> {
    return {
      status: 'ready',
      privateIp: '10.0.0.99',
      publicIp: '34.0.0.99',
      instanceId: 'mock-instance-99',
      sshUser: 'mock-user',
    };
  }
}

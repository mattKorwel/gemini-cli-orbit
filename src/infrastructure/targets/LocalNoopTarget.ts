/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InfrastructureProvisioner } from '../InfrastructureProvisioner.js';
import type { InfrastructureState } from '../InfrastructureState.js';

/**
 * A no-op provisioner for local worktree environments.
 * Infrastructure is assumed to be the local machine.
 */
export class LocalNoopTarget implements InfrastructureProvisioner {
  public readonly id: string;

  constructor(schematicName: string) {
    this.id = `local-${schematicName}`;
  }

  async up(): Promise<InfrastructureState> {
    return this.getState();
  }

  async down(): Promise<void> {
    // No-op for local
  }

  async refresh(): Promise<InfrastructureState> {
    return this.getState();
  }

  async getState(): Promise<InfrastructureState> {
    return {
      status: 'ready',
      privateIp: 'localhost',
      publicIp: '127.0.0.1',
      instanceId: 'local-machine',
      sshUser: process.env.USER || 'node',
    };
  }
}

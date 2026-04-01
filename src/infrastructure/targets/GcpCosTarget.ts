/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as gcp from '@pulumi/gcp';
import {
  LocalWorkspace,
} from '@pulumi/pulumi/automation/index.js';
import type { InfrastructureProvisioner } from '../InfrastructureProvisioner.js';
import type { InfrastructureState } from '../InfrastructureState.js';
import { PULUMI_STATE_DIR, type OrbitConfig } from '../../core/Constants.js';
import path from 'node:path';
import fs from 'node:fs';

/**
 * GCP Container-Optimized OS (COS) Provisioner.
 * Uses Pulumi Automation API to manage a persistent VM on GCE.
 */
export class GcpCosTarget implements InfrastructureProvisioner {
  public readonly id: string;
  private readonly stackName: string;
  private readonly workDir: string;
  private readonly projectName = 'orbit';

  constructor(
    private readonly schematicName: string,
    private readonly config: OrbitConfig,
  ) {
    this.id = `gcp-cos-${schematicName}`;
    this.stackName = schematicName;
    this.workDir = path.join(PULUMI_STATE_DIR, this.id);

    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
    }
  }

  /**
   * Pulumi Program defining the infrastructure.
   */
  private pulumiProgram = async () => {
    const name = this.config.instanceName || `gcli-station-${this.schematicName}`;
    const zone = this.config.zone || 'us-central1-a';
    const project = this.config.projectId;

    // 1. Create a static IP
    const address = new gcp.compute.Address(`${name}-ip`, {
      name: `${name}-ip`,
      region: zone.split('-').slice(0, 2).join('-'),
      ...(project ? { project } : {}),
    });

    // 2. Provision the VM
    const instance = new gcp.compute.Instance(name, {
      name,
      ...(project ? { project } : {}),
      machineType: this.config.machineType || 'n2-standard-4',
      zone,
      bootDisk: {
        initializeParams: {
          image: 'cos-cloud/cos-stable',
          size: 100,
          type: 'pd-ssd',
        },
      },
      networkInterfaces: [
        {
          network: this.config.vpcName || 'default',
          subnetwork: this.config.subnetName || 'default',
          accessConfigs: [{ natIp: address.address }],
        },
      ],
      metadata: {
        'gce-container-declaration': '',
        'enable-oslogin': 'TRUE',
      },
      labels: {
        'orbit-managed': 'true',
        'orbit-schematic': this.schematicName,
      },
      serviceAccount: {
        scopes: ['cloud-platform'],
      },
    });

    return {
      publicIp: address.address,
      privateIp: instance.networkInterfaces.apply(ni => ni[0]?.networkIp || ''),
      instanceId: instance.instanceId,
    };
  };

  async up(): Promise<InfrastructureState> {
    const stack = await LocalWorkspace.createOrSelectStack({
      stackName: this.stackName,
      projectName: this.projectName,
      program: this.pulumiProgram,
    }, { workDir: this.workDir });

    // Configure GCP Project
    if (this.config.projectId) {
      await stack.setConfig('gcp:project', { value: this.config.projectId });
    }

    console.log(`   🚀 Pulumi: Provisioning infrastructure for ${this.id}...`);
    try {
      const result = await stack.up({ onOutput: console.log });

      return {
        status: 'ready',
        publicIp: result.outputs.publicIp?.value,
        privateIp: result.outputs.privateIp?.value,
        instanceId: result.outputs.instanceId?.value,
      };
    } catch (e: any) {
      return {
        status: 'error',
        error: e.message || 'Unknown Pulumi error during provisioning.',
      };
    }
  }

  async down(): Promise<void> {
    const stack = await LocalWorkspace.createOrSelectStack({
      stackName: this.stackName,
      projectName: this.projectName,
      program: this.pulumiProgram,
    }, { workDir: this.workDir });

    console.log(`   🔥 Pulumi: Destroying infrastructure for ${this.id}...`);
    await stack.destroy({ onOutput: console.log });
  }

  async refresh(): Promise<InfrastructureState> {
    const stack = await LocalWorkspace.createOrSelectStack({
      stackName: this.stackName,
      projectName: this.projectName,
      program: this.pulumiProgram,
    }, { workDir: this.workDir });

    await stack.refresh();
    return this.getState();
  }

  async getState(): Promise<InfrastructureState> {
    try {
      const stack = await LocalWorkspace.createOrSelectStack({
        stackName: this.stackName,
        projectName: this.projectName,
        program: this.pulumiProgram,
      }, { workDir: this.workDir });

      const outs = await stack.outputs();
      return {
        status: 'ready',
        publicIp: outs.publicIp?.value,
        privateIp: outs.privateIp?.value,
        instanceId: outs.instanceId?.value,
      };
    } catch (_e) {
      return { status: 'destroyed' };
    }
  }
}

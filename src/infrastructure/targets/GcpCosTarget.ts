/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { LocalWorkspace } from '@pulumi/pulumi/automation/index.js';
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
  private readonly logPath: string;

  constructor(
    private readonly schematicName: string,
    private readonly config: OrbitConfig,
  ) {
    const stackId = config.instanceName || schematicName;
    this.id = `gcp-cos-${stackId}`;
    this.stackName = stackId;
    this.workDir = path.join(PULUMI_STATE_DIR, this.id);
    this.logPath = path.join(this.workDir, 'pulumi.log');

    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
    }
  }

  /**
   * Helper to handle Pulumi output streams.
   * Redirects all output to pulumi.log, and conditionally to console.
   */
  private getOutputHandler() {
    // Clear log for fresh run
    if (fs.existsSync(this.logPath)) fs.unlinkSync(this.logPath);

    return (text: string) => {
      fs.appendFileSync(this.logPath, text);
      if (this.config.verbose) {
        process.stdout.write(text);
      }
    };
  }

  /**
   * Pulumi Program defining the infrastructure.
   */
  private pulumiProgram = async () => {
    const name =
      this.config.instanceName || `orbit-station-${this.schematicName}`;
    const zone = this.config.zone || 'us-central1-a';
    const project = this.config.projectId;
    const isExternal = this.config.backendType === 'external';

    const provider = new gcp.Provider('gcp-provider', {
      ...(project ? { project } : {}),
      zone,
    });

    const region = zone.split('-').slice(0, 2).join('-');

    // 1. Networking Layer
    let network: gcp.compute.Network | undefined;
    let subnetwork: gcp.compute.Subnetwork | undefined;
    let networkName: pulumi.Input<string> = this.config.vpcName || 'default';
    let subnetName: pulumi.Input<string> = this.config.subnetName || 'default';

    if (this.config.manageNetworking) {
      // Use instance-specific names for managed networks to ensure isolation and prevent conflicts
      const vpcId =
        this.config.vpcName && this.config.vpcName !== 'orbit'
          ? this.config.vpcName
          : `orbit-vpc-${this.stackName}`;

      const subId =
        this.config.subnetName && this.config.subnetName !== 'orbit'
          ? this.config.subnetName
          : `orbit-subnet-${this.stackName}`;

      network = new gcp.compute.Network(
        `orbit-vpc-${this.id}`,
        {
          name: vpcId,
          autoCreateSubnetworks: false,
        },
        { provider },
      );
      networkName = network.name;

      subnetwork = new gcp.compute.Subnetwork(
        `orbit-subnet-${this.id}`,
        {
          name: subId,
          network: network.id,
          ipCidrRange: '10.128.0.0/24',
          region,
        },
        { provider, dependsOn: [network] },
      );
      subnetName = subnetwork.name;

      // Cloud Router & NAT (Outbound access for images)
      const router = new gcp.compute.Router(
        `orbit-router-${this.id}`,
        {
          name: `orbit-router-${this.id}`,
          network: network.id,
          region,
        },
        { provider, dependsOn: [network] },
      );

      new gcp.compute.RouterNat(
        `orbit-nat-${this.id}`,
        {
          name: `orbit-nat-${this.id}`,
          router: router.name,
          region,
          natIpAllocateOption: 'AUTO_ONLY',
          sourceSubnetworkIpRangesToNat: 'ALL_SUBNETWORKS_ALL_IP_RANGES',
        },
        { provider, dependsOn: [router] },
      );

      // Firewall Rules
      if (
        this.config.sshSourceRanges &&
        this.config.sshSourceRanges.length > 0
      ) {
        new gcp.compute.Firewall(
          `orbit-ssh-${this.id}`,
          {
            name: `orbit-ssh-${this.id}`,
            network: network.id,
            allows: [{ protocol: 'tcp', ports: ['22'] }],
            sourceRanges: this.config.sshSourceRanges,
          },
          { provider, dependsOn: [network] },
        );
      }
    }

    // 2. Static IP (only if external)
    let address: gcp.compute.Address | undefined;
    if (isExternal) {
      const addressName = `orbit-ip-${this.id}`;
      address = new gcp.compute.Address(
        addressName,
        {
          name: addressName,
          region,
        },
        { provider },
      );
    }

    // 3. Data Disk (Persistent storage for workspaces and mirrors)
    const dataDiskName = `orbit-data-${this.id}`;
    const dataDisk = new gcp.compute.Disk(
      dataDiskName,
      {
        name: dataDiskName,
        size: 500,
        type: 'pd-balanced',
        zone,
      },
      { provider },
    );

    // 4. Provision the VM
    const instance = new gcp.compute.Instance(
      name,
      {
        name,
        machineType: this.config.machineType || 'n2-standard-4',
        zone,
        bootDisk: {
          initializeParams: {
            image: 'cos-cloud/cos-stable',
            size: 200,
          },
        },
        attachedDisks: [
          {
            source: dataDisk.id,
            deviceName: 'orbit-data',
          },
        ],
        networkInterfaces: [
          {
            network: networkName,
            subnetwork: subnetName,
            accessConfigs:
              isExternal && address ? [{ natIp: address.address }] : [],
          },
        ],
        metadata: {
          'gce-container-declaration': '',
          'enable-oslogin': 'TRUE',
          'startup-script': `#!/bin/bash
            set -e
            DEVICE_PATH="/dev/disk/by-id/google-orbit-data"
            MOUNT_PATH="/mnt/disks/data"
            
            if [ ! -e "$DEVICE_PATH" ]; then
              echo "Waiting for device $DEVICE_PATH..."
              sleep 5
            fi

            # Format if unformatted
            if ! blkid "$DEVICE_PATH"; then
              mkfs.ext4 -m 0 -E lazy_itable_init=0,lazy_journal_init=0,discard "$DEVICE_PATH"
            fi

            mkdir -p "$MOUNT_PATH"
            mount -o discard,defaults "$DEVICE_PATH" "$MOUNT_PATH" || true
            chmod 777 "$MOUNT_PATH"
          `,
        },
        labels: {
          'orbit-managed': 'true',
          'orbit-schematic': this.schematicName,
        },
        serviceAccount: {
          scopes: ['cloud-platform'],
        },
        allowStoppingForUpdate: true,
      },
      {
        provider,
        dependsOn: subnetwork ? [subnetwork, dataDisk] : [dataDisk],
      },
    );

    return {
      publicIp: address?.address,
      privateIp: instance.networkInterfaces.apply(
        (ni: any[]) => ni[0]?.networkIp || '',
      ),
      instanceId: instance.instanceId,
    };
  };

  async up(): Promise<InfrastructureState> {
    const stack = await LocalWorkspace.createOrSelectStack(
      {
        stackName: this.stackName,
        projectName: this.projectName,
        program: this.pulumiProgram,
      },
      { workDir: this.workDir },
    );

    // Configure GCP Project for the CLI (backup config)
    if (this.config.projectId) {
      await stack.setConfig('gcp:project', { value: this.config.projectId });
    }

    console.log(`   🚀 Pulumi: Provisioning infrastructure for ${this.id}...`);
    if (!this.config.verbose) {
      console.log(`      (Detailed logs redirected to ${this.logPath})`);
    }

    try {
      const result = await stack.up({ onOutput: this.getOutputHandler() });

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
    const stack = await LocalWorkspace.createOrSelectStack(
      {
        stackName: this.stackName,
        projectName: this.projectName,
        program: this.pulumiProgram,
      },
      { workDir: this.workDir },
    );

    console.log(`   🔥 Pulumi: Destroying infrastructure for ${this.id}...`);
    await stack.destroy({ onOutput: this.getOutputHandler() });
  }

  async refresh(): Promise<InfrastructureState> {
    const stack = await LocalWorkspace.createOrSelectStack(
      {
        stackName: this.stackName,
        projectName: this.projectName,
        program: this.pulumiProgram,
      },
      { workDir: this.workDir },
    );

    await stack.refresh({ onOutput: this.getOutputHandler() });
    return this.getState();
  }

  async getState(): Promise<InfrastructureState> {
    try {
      const stack = await LocalWorkspace.createOrSelectStack(
        {
          stackName: this.stackName,
          projectName: this.projectName,
          program: this.pulumiProgram,
        },
        { workDir: this.workDir },
      );

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

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
import { logger } from '../../core/Logger.js';
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
   * Determine the best disk type for the selected machine series.
   */
  private getRecommendedDiskType(machineType: string): string {
    const series = machineType.toLowerCase();
    // N4, C3, C4, M3 series require Hyperdisk
    if (
      series.startsWith('n4-') ||
      series.startsWith('c3-') ||
      series.startsWith('c4-') ||
      series.startsWith('m3-')
    ) {
      return 'hyperdisk-balanced';
    }
    // N1, N2, E2, T2D, etc. use PD
    return 'pd-balanced';
  }

  /**
   * Pulumi Program defining the infrastructure.
   */
  private pulumiProgram = async () => {
    const name = this.config.instanceName || `station-${this.schematicName}`;
    const zone = this.config.zone || 'us-central1-a';
    const project = this.config.projectId;
    const isExternal = this.config.networkAccessType === 'external';
    const machineType = this.config.machineType || 'n2-standard-4';

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
        type:
          this.config.dataDiskType || this.getRecommendedDiskType(machineType),
        zone,
      },
      { provider },
    );

    // 4. Provision the VM
    const instance = new gcp.compute.Instance(
      name,
      {
        name,
        machineType,
        zone,
        bootDisk: {
          initializeParams: {
            image: 'cos-cloud/cos-stable',
            size: 200,
            ...(this.config.bootDiskType
              ? { type: this.config.bootDiskType }
              : {}),
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
          'enable-oslogin': 'TRUE',
          'startup-script': `#!/bin/bash
            echo "Orbit: Starting startup-script..."
            DEVICE_PATH="/dev/disk/by-id/google-orbit-data"
            MOUNT_PATH="/mnt/disks/data"
            
            # Wait for device to appear
            for i in {1..10}; do
              if [ -e "$DEVICE_PATH" ]; then break; fi
              echo "Waiting for device $DEVICE_PATH (attempt $i)..."
              sleep 5
            done

            if [ ! -e "$DEVICE_PATH" ]; then
              echo "Error: Device $DEVICE_PATH never appeared."
              exit 1
            fi

            # Format if unformatted
            if ! blkid "$DEVICE_PATH" > /dev/null 2>&1; then
              echo "Formatting $DEVICE_PATH..."
              mkfs.ext4 -m 0 -E lazy_itable_init=1,lazy_journal_init=0,discard "$DEVICE_PATH"
            else
              echo "Device $DEVICE_PATH already formatted."
            fi

            mkdir -p "$MOUNT_PATH"
            echo "Mounting $DEVICE_PATH to $MOUNT_PATH..."
            mount -o discard,defaults "$DEVICE_PATH" "$MOUNT_PATH" || echo "Warning: Mount failed, possibly already mounted."
            
            # Ensure proper ownership and permissions for the data disk
            # 1000 is the standard 'node' user UID in most containers
            chown -R 1000:1000 "$MOUNT_PATH"
            chmod -R 2775 "$MOUNT_PATH"
            
            echo "Orbit: Starting Starfleet Bootstrap..."
            IMAGE="ghcr.io/mattkorwel/gemini-cli-orbit:latest"
            CONTAINER_NAME="station-supervisor"
            
            # Prepare ground truth filesystem
            mkdir -p $MOUNT_PATH/bin
            
            # --- STARFLEET HARDWARE LOCK ---
            # Default: Locked (No dev folder, limited node permissions)
            if [ "${this.config.allowDevUpdates || 'false'}" == "true" ]; then
              echo "Orbit: UNLOCKING station for development updates..."
              mkdir -p $MOUNT_PATH/dev/bundle
              touch $MOUNT_PATH/.starfleet-dev-unlocked
              chown -R 1000:1000 $MOUNT_PATH
              chmod -R 775 $MOUNT_PATH
            else
              echo "Orbit: Station is LOCKED (Production mode)."
              rm -f $MOUNT_PATH/.starfleet-dev-unlocked
              chown -R 1000:1000 $MOUNT_PATH
              # Restrict write access to sensitive areas if possible
              chmod -R 755 $MOUNT_PATH
              chmod -R 775 $MOUNT_PATH/workspaces # Missions still need to write
            fi
            
            # Pull and Start Supervisor with Retry
            echo "Orbit: Pulling $IMAGE..."
            for i in {1..10}; do
              if docker pull $IMAGE; then
                echo " Orbit: Pull successful."
                break
              fi
              echo " Orbit: Pull failed (attempt $i), waiting for network..."
              sleep 10
            done

            # SEED THE DISK: Copy the bundle from the image to the persistent disk
            # This allows the --dev flag to overwrite it later for rapid dev.
            echo "Orbit: Seeding logic to disk..."
            docker run --rm -v $MOUNT_PATH/bin:/target $IMAGE cp -r /usr/local/lib/orbit/bundle/. /target/

            # Use the optimized orbit-worker image for mission capsules
            # The supervisor remains on the fat image for orchestration capabilities
            WORKER_IMAGE="ghcr.io/mattkorwel/orbit-worker:latest"

            # Fix Docker socket permissions for the container user (node:1000)
            # On COS, the docker group ID can vary, so we grant world-write to the socket
            # in a controlled way or ensure the container user has access.
            chmod 666 /var/run/docker.sock

            docker run -d \
              --name $CONTAINER_NAME \
              --restart always \
              -p 8080:8080 \
              -v /var/run/docker.sock:/var/run/docker.sock \
              -v $MOUNT_PATH:$MOUNT_PATH \
              -v $MOUNT_PATH/workspaces:$MOUNT_PATH/workspaces \
              -v /dev/shm:/dev/shm \
              -e ORBIT_SERVER_PORT=8080 \
              -e GCLI_ORBIT_WORKER_IMAGE=$WORKER_IMAGE \
              $IMAGE \
              node $MOUNT_PATH/bin/orbit-server.js

            echo "Orbit: Startup-script complete."
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

    logger.info(
      'SETUP',
      `   🚀 Pulumi: Provisioning infrastructure for ${this.id}...`,
    );
    if (!this.config.verbose) {
      logger.info(
        'SETUP',
        `      (Detailed logs redirected to ${this.logPath})`,
      );
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

    logger.info(
      'SETUP',
      `   🔥 Pulumi: Destroying infrastructure for ${this.id}...`,
    );
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

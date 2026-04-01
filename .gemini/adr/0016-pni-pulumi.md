# ADR 0016: Pulumi-Native Infrastructure (PNI)

## Status
Proposed

## Context
Gemini Orbit currently manages infrastructure using imperative `gcloud` commands scattered throughout the codebase (e.g., `GceCosProvider.ts`). This leads to:
- **Cloud Lock-in**: Hard-coded to Google Cloud Platform.
- **Brittle Logic**: Manual networking management (VPC, NAT, Firewalls) via shell wrappers.
- **Lack of Customization**: No declarative way for users to define their station infrastructure.
- **Maintenance Fragmentation**: Infrastructure logic is "hidden" inside TypeScript strings and regex parsing.

## Decision
We will transition Orbit to a **Programmatic Infrastructure** model powered by the **Pulumi Automation API**.

### 1. Unified TypeScript Infrastructure
Infrastructure will be defined using standard TypeScript modules under `scripts/infrastructure/`.
- **`GcpStation.ts`**: Defines the GCP resources (VPC, VM, Firewall, NAT).
- **`AwsStation.ts`**: (Future) Defines the AWS resources (VPC, EC2, Security Groups).

### 2. Pulumi Automation API
Orbit's `liftoff` (provisioning) and `splashdown` (destruction) will use the **Pulumi Automation API**.
- **No CLI Wrapper**: Orbit calls Pulumi as a library, ensuring better error handling and total state management.
- **Local State**: Pulumi state will be stored locally in `~/.gemini/orbit/state/` by default, but can be configured for remote backends.

### 3. Target-Aware Provisioning Model
The `InfrastructureManager` will support multiple "Targets" within a single cloud provider. This allows Orbit to provision different types of infrastructure depending on the `Schematic`:
- **`gce-cos`**: Standard Compute Engine instances (current default).
- **`cloud-workstations`**: Managed Google Cloud Workstations (managed IDE environments).
- **`gke-pod`**: Ephemeral pods within a Google Kubernetes Engine cluster.
- **`aws-ec2`**: (Future) Amazon EC2 instances.

Each target is implemented as a dedicated Pulumi module in `scripts/infrastructure/targets/`.

### 4. Decoupled Provider Architecture
We will split the existing `OrbitProvider` into two distinct layers:
- **Infrastructure Provisioner**: A stateless engine that ensures the cloud resources exist and return a standard `InfrastructureState` (IPs, IDs).
- **Execution Provider**: A stateful operational layer that uses the `InfrastructureState` to launch missions (Docker, SSH, Sync, or Workstation Attach).

### 5. Migration Strategy
- **Phase 1**: Implement the `PulumiInfrastructureManager` and the `@pulumi/gcp` modules for the "GCP Station".
- **Phase 2**: Refactor `GceCosProvider` to receive its configuration from the Pulumi outputs.
- **Phase 3**: Migrate the "Local Worktree" provider to the same interface (even if it's a "No-op" provisioner).
- **Phase 5**: Deprecate and remove all direct `gcloud` provisioning calls.

## Rationale
- **Type Safety**: Infrastructure is now type-checked at compile-time.
- **Single Language**: No DSL (HCL) to learn. All Orbit code remains TypeScript.
- **Programmatic Logic**: Allows for dynamic, complex infrastructure (e.g., auto-detecting existing VPCs, dynamic subnetting).
- **State Management**: Pulumi's native state handling eliminates "zombie" resources and manual existence checks.
- **Ecosystem**: Provides a clear path to supporting AWS, Azure, and other clouds using their respective Pulumi libraries.

## Consequences
- **NPM Dependencies**: New dependencies on `@pulumi/pulumi`, `@pulumi/gcp`, etc.
- **Binary Download**: Pulumi will download the same cloud provider binaries (e.g., `pulumi-resource-gcp`) that Terraform uses.
- **Learning Curve**: Developers will need to understand the Pulumi/Resource model, though it is native TypeScript.

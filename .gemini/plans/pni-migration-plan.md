# Implementation Plan: Pulumi-Native Infrastructure (PNI) Migration

This plan outlines the steps to decouple infrastructure provisioning from
operational management by introducing a TypeScript-native IaC layer using
**Pulumi**.

## Objective

1.  **Remove `gcloud` dependency** for infrastructure provisioning.
2.  **Implement Multi-cloud support** via Pulumi's provider ecosystem.
3.  **Ensure Declarative State** for all cloud resources.

---

## Phase 0: Foundation & Setup

- **Dependencies**:
  - Add `@pulumi/pulumi` (Automation API)
  - Add `@pulumi/gcp` (GCP Provider)
  - Add `@pulumi/aws` (AWS Provider - for future-proofing)
- **State Storage**: Configure Orbit to use a local filesystem backend for
  Pulumi state (`~/.gemini/orbit/state/`).

## Phase 1: New Abstraction Layer

Create the core interfaces for the decoupled architecture:

- **`InfrastructureProvisioner`**: Defines the `up()`, `down()`, and `refresh()`
  methods.
- **`InfrastructureState`**: Standardized output containing:
  - `publicIp`: The external IP of the station.
  - `privateIp`: The internal IP of the station.
  - `instanceId`: The unique cloud identifier.
  - `sshUser`: The resolved OS Login or manual user.

## Phase 2: The Target-Aware Provisioners

Implement the first set of remote provisioners in
`scripts/infrastructure/targets/`:

- **`GcpCosTarget.ts`**: Translates current `GCE COS` logic.
- **`GcpWorkstationTarget.ts`**: Adds support for managed Google Cloud
  Workstations.
- **`GcpK8sTarget.ts`**: Adds support for ephemeral pods in GKE clusters.
- **`LocalNoopTarget.ts`**: Maintains interface parity for local worktree
  development.

All targets use the Pulumi Automation API to manage their stack lifecycle
programmatically.

## Phase 3: Provider & CLI Update

Update the `ExecutionProvider` to support diverse targets:

- **`GceExecutionProvider`**: Standard Docker/SSH execution.
- **`WorkstationExecutionProvider`**: Integration with `gh workstation` or
  custom attach logic.
- **`K8sExecutionProvider`**: Command execution via `kubectl exec`.

Update `scripts/setup.ts` (Liftoff) to use the new `InfrastructureFactory`.

- **Factory**:
  `InfrastructureFactory.getProvisioner(schematic.provider, schematic.target)`.
- **Flow**:
  1.  `provisioner.up()` (Pulumi creates resources).
  2.  Pass the resulting `InfrastructureState` to the `ExecutionProvider`.
  3.  `executionProvider.ensureReady()` (Verify health/connectivity).

## Phase 5: Verification & Cleanup

- **E2E Testing**: Verify `orbit liftoff` with a new schematic correctly
  provisions a VM on GCP.
- **Code Cleanup**: Remove all `spawnSync('gcloud', ...)` provisioning calls and
  manual "wait for network" logic.

# ADR 0016: Pulumi-Native Infrastructure (PNI)

## Status

Accepted

## Context

Gemini Orbit originally managed infrastructure using imperative `gcloud`
commands scattered throughout the codebase. This led to:

- **Cloud Lock-in**: Hard-coded to Google Cloud Platform.
- **Brittle Logic**: Manual networking management (VPC, NAT, Firewalls) via
  shell wrappers.
- **Lack of Customization**: No declarative way for users to define their
  station infrastructure.
- **Maintenance Fragmentation**: Infrastructure logic was "hidden" inside
  TypeScript strings and regex parsing.

## Decision

We have transitioned Orbit to a **Programmatic Infrastructure** model powered by
the **Pulumi Automation API**.

### 1. Unified TypeScript Infrastructure

Infrastructure is defined using standard TypeScript modules under
`src/infrastructure/`.

- **`GcpCosTarget.ts`**: Defines the GCP resources (Static IP, VM with COS).
- **`LocalNoopTarget.ts`**: Provides parity for local development environments.

### 2. Pulumi Automation API & Local State

Orbit's `liftoff` (provisioning) and `liftoff --destroy` (decommissioning) use
the **Pulumi Automation API**.

- **Local State Backend**: Pulumi state is stored locally in
  `~/.gemini/orbit/state/` (using `pulumi login --local`).
- **Passphrase Management**: Orbit automatically manages a stable encryption
  passphrase in `~/.gemini/orbit/pulumi.passphrase` to ensure a non-interactive
  experience.

### 3. Target-Aware Provisioning Model

The `InfrastructureFactory` supports multiple "Targets" within a single cloud
provider. This allows Orbit to provision different types of infrastructure
depending on the `Schematic` (e.g., `gce`, `local-worktree`).

### 4. Decoupled Provider Architecture

We have split the workspace lifecycle into two distinct layers:

- **Infrastructure Provisioner** (`src/infrastructure/`): A declarative engine
  that ensures the physical/virtual resources exist and returns a standard
  `InfrastructureState`.
- **Execution Provider** (`src/providers/`): An operational layer
  (`OrbitProvider`) that consumes the state to establish connectivity and manage
  mission capsules (Docker/SSH/Worktree).

### 5. Seamless Dependency Management

To ensure a zero-friction experience, Orbit includes a `DependencyManager` that:

- Detects the presence of the `pulumi` binary.
- Automatically downloads and installs the correct binary for the user's OS/Arch
  into `~/.gemini/orbit/bin/` if missing (requires explicit user confirmation).

## Rationale

- **Type Safety**: Infrastructure is now type-checked at compile-time.
- **Programmatic Logic**: Allows for dynamic, complex infrastructure (e.g.,
  conditional resource creation based on `backendType`).
- **State Management**: Pulumi's native state handling eliminates "zombie"
  resources and manual existence checks.
- **User Experience**: The auto-installer ensures users don't have to leave the
  CLI to set up their environment.

## Consequences

- **NPM Dependencies**: Added `@pulumi/pulumi` and `@pulumi/gcp`.
- **Storage**: Managed binaries and infrastructure state occupy space in
  `~/.gemini/orbit/`.
- **Connectivity**: Cloud provisioning requires active GCP credentials in the
  environment.

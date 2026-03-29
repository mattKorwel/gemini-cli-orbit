# ADR: Shared State Architecture (Remote Orbits)

## Context

In our "Branch per Container" architecture, each orbit session runs in an
isolated Docker container. However, these containers need access to the same
Gemini CLI configuration, linked extensions, and ported skills to function
effectively.

## Decision

We have decided to use a **Shared Configuration** strategy:

1.  **Shared Disk**: The persistent data disk (`/mnt/disks/data`) is mounted
    into all containers.
2.  **Shared .gemini**: The host directory
    `/mnt/disks/data/gemini-cli-config/.gemini` is mounted to
    `/home/node/.gemini` in **every** container.

## Consequences

- **Pros**:
  - **Speed**: Extensions only need to be linked once; they are instantly
    available to all PR containers.
  - **Consistency**: UI themes, auth settings, and aliases are unified across
    all remote sessions.
  - **Simplicity**: No need for per-container initialization scripts.
- **Cons**:
  - **Isolation Boundary**: A compromised container could theoretically modify
    the shared `extension-enablement.json`.
  - **Trust**: We assume a high level of trust across all containers running on
    a single private worker.

## Status

Accepted - March 2026

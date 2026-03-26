# Architectural Mandate: High-Performance Orbit System

## Infrastructure Strategy
- **Base OS**: Always use **Capsule-Optimized OS (COS)** (`cos-stable` family). It is security-hardened and has Docker pre-installed.
- **Provisioning**: Use the **Cloud-Init (`user-data`)** pattern. 
    - *Note*: Avoid `gcloud compute instances create-with-capsule` on standard Linux images as it uses a deprecated startup agent. On COS, use native `user-data` for cleanest execution.
- **Performance**: Provision with a minimum of **200GB PD-Balanced** disk to ensure high I/O throughput for Node.js builds and to satisfy GCP disk performance requirements.

## Capsule Isolation
- **Image**: `us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest`.
- **Identity**: The capsule must be named **`development-station`**.
- **Mounts**: Standardize on these host-to-capsule mappings:
    - `~/dev` -> `/home/node/dev` (Persistence for worktrees)
    - `~/.gemini` -> `/home/node/.gemini` (Shared credentials)
    - `~/.orbit` -> `/home/node/.orbit` (Shared scripts/logs)
- **Runtime**: The capsule runs as a persistent service (`--restart always`) acting as a "Remote Workstation" rather than an ephemeral task.

## Orchestration Logic
- **Station Provider Abstraction**: Infrastructure is managed via a `StationProvider` interface (e.g., `GceCosProvider`). This decouples the orchestration logic from the underlying platform.
- **Robust Connectivity**: The system uses a dual-path connectivity strategy:
    1. **Fast-Path SSH**: Primary connection via a standard SSH alias (`gcli-station`) for high-performance synchronization and interaction.
    2. **IAP Fallback**: Automatic fallback to `gcloud compute ssh --tunnel-through-iap` for users off-VPC or when direct DNS resolution fails.
- **Context Execution**: Use `docker exec -it development-station ...` for interactive tasks and `tmux` sessions. This provides persistence against connection drops while keeping the host OS "invisible."
- **Path Resolution**: Both Host and Capsule must share identical tilde (`~`) paths to avoid mapping confusion in automation scripts.

## Git & Path Management
- **Capsule-First Git**: All git operations (cloning, fetching, and worktree creation) MUST be performed inside the `development-station` capsule. This ensures that absolute paths stored in `.git` metadata (e.g., in `.git` files of worktrees) are consistent with the capsule's filesystem, preventing "not a git repository" errors.
- **Root Path Standardization**: Standardize the root path to `/mnt/disks/data` for both host and capsule to ensure absolute path parity across environments.

## Maintenance
- **Rebuilds**: If the environment drifts or the image updates, delete the VM and re-run the `provision` action.
- **Status**: The Mission Control dashboard derives state by scanning host `tmux` sessions and capsule filesystem logs.

# Mission: Starfleet Ignition & Tiered Transport 🛰️

## Current State

We have successfully refactored the **Starfleet architecture** to be
blueprint-driven and persistent. The Supervisor is now a "deterministic brain"
that hydrates its environment from a JSON blueprint, and missions are born
inside persistent `tmux` sessions.

### Key Accomplishments

1.  **Hydration**: `server.ts` loads `StationSupervisorConfig` from
    `/etc/orbit/station.json` (Prod) or `configs/station.local.json` (Dev).
2.  **Persistence**: `starfleet-entrypoint.sh` wraps `mission.js` in a styled
    tmux session.
3.  **Tiered Transport**: Created `StationTransport` interface with
    `IdentityTransport` (Local Docker) and `SshTransport` (GCE).
4.  **Verified Ignition**: `MissionOrchestrator` now polls for
    `state.json [IDLE]` before returning success.
5.  **Path Translation**: Supervisor now correctly maps container-side workdirs
    to host-side paths for Git operations.

## Pending Tasks (The "Restart" List)

### 1. Flag-Driven Targeting (Simplified Model)

Refactor the CLI and `ProviderFactory` to use direct flags as the source of
truth, bypassing redundant schematics:

- `--local-docker`: Use `local-docker` provider + `IdentityTransport` (Target:
  Mac Docker).
- `--local`: Use `local-git` provider (Target: Mac Worktrees).
- `--schematic <name>`: Use `gce` provider + `SshTransport` (Target: GCE VM).

### 2. Schema Cleanup

- Rename `backendType` to `networkAccessType` in any straggling files
  (Constants, Types).
- Update `OrbitConfig` interface to include the `localDocker` boolean flag.

### 3. Finalize Factory Refactor

Complete the logic in `ProviderFactory.ts` to map the high-level buckets
(`local-git`, `local-docker`, `gce`) to their respective implementations without
complex `if` logic.

## Developer Toolkit

- `npm run starfleet:local`: Starts the sandboxed Mac Supervisor.
- `npm run station:smoke <id>`: Tests the API directly (bypasses CLI).
- `npm run mission:validate <id>`: Deep diagnostic of the mission state.
- `npm run infra:push`: Builds and pushes the AMD64 images.

## Environment Note

Local testing is sandboxed to `./orbit-test-run/` to avoid root permission
issues. Absolute paths are enforced for Docker volume stability.

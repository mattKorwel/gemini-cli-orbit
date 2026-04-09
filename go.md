# Mission: Starfleet Ignition & Polymorphic Transport 🛰️

## Current State

The Starfleet architecture has been fully refactored into a clean, polymorphic
hierarchy that eliminates environment-specific "if" checks in the business
logic. We have transitioned to a containerized Supervisor for local development
to ensure parity with GCE.

### Key Accomplishments

1.  **Polymorphic Provider Hierarchy**:
    - `StarfleetProvider` (Abstract Base): Unified API logic and path
      resolution.
    - `LocalDockerStarfleetProvider`: Manages local supervisor container and
      Mac-specific mounts.
    - `GceStarfleetProvider`: Implements full 6-step hardware handshake (SSH,
      Disk, Docker).
2.  **Manifest-First Integration**:
    - `sessionName` is now synchronized via the hydrated manifest (no more
      hardcoded `orbit-mission`).
    - `policyPath` and `workDir` are pre-hydrated for the specific target
      environment (Mac Host vs Capsule).
3.  **Terminal & Trust Stability**:
    - `ProcessManager` and Transports now use `runSync` for `attach`, correctly
      passing through the TTY.
    - `GCLI_TRUST=1` and `COLORTERM` are automatically propagated to capsules.
    - `~/.gemini` is mounted into local containers to inherit user settings and
      auth.
4.  **Starfleet API Refinement**:
    - `StarfleetClient` now handles GET/POST headers correctly (fixed
      `ECONNRESET` on GET).
    - Supervisor `/exec` handler provides detailed error reporting.
5.  **Build Integrity**: Resolved all 60+ TypeScript errors and reached a clean
    lint state.

## Current "Stuck" Point (Local Docker)

The containerized supervisor (`station-supervisor-local`) is currently
experiencing a crash loop or `ECONNRESET` when running natively on Mac.

- **Hypothesis**: The `DockerExecutor` is still attempting to use `sudo` inside
  the container or there is a mismatch in the `DOCKER_HOST` socket path when
  passed from Mac -> Container.
- **Observation**: Manual `docker exec` shows Gemini successfully starting, but
  the SDK's automated bridge is still flaky.

## Next Steps

1.  **Stabilize Local Supervisor Container**: Fix the internal crash loop in the
    containerized supervisor.
2.  **Dynamic Port Mapping**: (TODO) Implement dynamic port allocation to
    support multiple concurrent stations on one host.
3.  **GCE BeyondCorp Verification**: Verify the full GCE ignition sequence now
    that the polymorphic logic is committed.

## Developer Toolkit

- `npm run build`: Full typecheck and bundle.
- `npm run starfleet:local`: Starts the dynamic local supervisor with Mac
  mounts.
- `orbit mission start <id> --local-docker`: Launches a mission via the
  containerized path.

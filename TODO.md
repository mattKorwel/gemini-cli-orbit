- [ ] Auth: Explore 'Auth Pass-through' (non-recommended) to leverage local gh
      CLI auth on remote stations without manual PAT injection.
- [x] UX: Show 'Establishing mission uplink...' message when connecting to
      remote station.
- [x] UX: Add 'uplink'/connectivity status verbage when attempting remote
      communication (e.g. '📡 Establishing mission uplink...')
- [x] UI: Fix 'verifying access' step to clearly fail if connectivity is not
      established instead of silently proceeding to remote initialization.
- [x] Security: Verify that .gemini/orbit/gh_token is never accidentally
      committed (it is currently ignored by global .gemini rules).
- [x] Fork Logic: Do not attempt to fork if the repository is already owned by
      the user.
- [x] UI: Fix odd printing/alignment of fork logic output compared to networking
      section.
- [x] Security: Migrated repository tokens to global storage
      (~/.gemini/orbit/tokens/) to prevent accidental commits.
- [x] Resolve disk size warnings on VM creation (boot disk 200GB vs 10GB image
      noise)
- [x] Orbit: Implement Consolidated missions (ADR 10, 11)
  - [x] Implement high-fidelity "Implement" mission.
  - [x] Implement high-fidelity "Fix" mission.
  - [x] Consolidate maneuver documentation into `MANEUVERS.md`.
- [x] CI: Enhanced logging to print branch, repo, and run information.
- [x] CLI: Commands support plural or singular (stations, missions, etc.).
- [x] CLI: `liftoff` has its own top-level command and help.
- [x] CLI: Clarified difference between `--for-station` and `liftoff <name>`.
- [x] UX: Fixed `liftoff` positional vs `--schematic` flag shadowing.
- [x] UX: Standardized `station <action> <name>`: `<name>` is always the
      instance name.
- [x] CLI: Consolidated `orbit liftoff` and `orbit station liftoff` to reduce
      redundancy.

## Phase 2: Orchestration & Resilience

- [ ] Logic: Implement automatic "Wake-on-Mission" (trigger liftoff if active
      station is hibernated).
- [ ] UX: Add a `dashboard` command for a live TMUX-like view of all active
      missions.
- [ ] UI: Improved progress bars for long-running Pulumi operations.

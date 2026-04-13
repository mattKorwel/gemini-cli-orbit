## Follow-Up TODOs (Archived from Plan)

- Consolidate station-side ownership normalization into one shared utility.
- Keep ownership policy code-owned for known writable areas instead of adding
  dynamic ownership rules to the station blueprint.
- Current known writable areas:
  - mission workspaces under `storage.workspacesRoot`
  - station Gemini home under the `globalGemini` mount
- Complete the network config cleanup after the tactical rename:
  - revisit whether `vpcName` / `subnetName` should survive the common path
  - consider a clearer long-term network/firewall mode model than flat booleans
- Should raw SSH remain default for GCE, or should personal-project docs pivot
  to `ssh-public` as the recommended default?
- Move host-path resolution fully into startup hydration so `StationApi` stops
  re-deriving host workspace roots from capsule paths for logs and status.
- Keep the station startup contract narrow:
  - supervisor consumes the blueprint plus one optional
    `GCLI_ORBIT_HOST_PATH_BASE`
  - remove path-specific override envs permanently
  - keep capsule/internal paths in blueprint storage fields and host paths in
    mounts/areas only

## Specific Implementation TODOs

- Add an `orbit infra prepare-gcp-personal` command.
- Scope that command as a two-part setup flow:
  - prepare the target GCP project for Orbit use
  - create or update the recommended personal-project schematic
- When this lands, document clearly that `infra prepare` is not just auth or
  host prep; it also materializes the schematic Orbit will use for liftoff.
- In the personal GCP flow, detect the caller public IP and save
  `sshSourceRanges: ["<detected-ip>/32"]` into the generated schematic.
- For managed `external` networking, create a sane SSH ingress rule by default
  instead of silently provisioning an unreachable VM.
- Resolve and persist the correct OS Login SSH username for the target GCP
  project instead of assuming the local machine username.
- Update docs to explain the managed-networking behavior clearly:
  - `external` + managed networking must provision both public reachability and
    SSH ingress
  - `manageNetworking: false` leaves firewalling/routing to the user
- Rename the Docker images throughout the stack to clearer product names:
  - supervisor image -> `orbit/station`
  - worker image -> `orbit/mission-capsule`
  - update all build, push, provisioning, provider, and docs references together
- Make the GCE data disk size configurable in schematics/config instead of
  hardcoding the provisioner default.
- Keep the default small for personal/test projects; current default target is
  50 GB.
- Simplify `local-worktree` startup.
- Current `local-worktree` chat launch is slower than expected and appears to
  traverse more orchestration hops than the local tmux-backed path should need.
- Revisit whether `local-worktree` can skip generic mission orchestration layers
  that are only valuable for station/API-backed flows.
- Replace the tactical GCE supervisor refresh path in `liftoff`.
- Current implementation uses a shell-assembled remote refresh command in
  `GceStarfleetProvider`; move this to structured executor/command building
  instead of `sh -lc` string concatenation.
- Keep the refresh behavior, but make it consistent with the executor-first
  architecture and ensure the state logging reflects real Docker state rather
  than fabricated fallback values.
- Add a proper npm script for image publishing.
- Current flow uses `npx tsx scripts/infra-push.ts`; add a stable script such as
  `npm run infra:push` so the workflow is discoverable and consistent.
- Revisit mission shell modes.
- Current temporary debugging need is pushing `mission shell` through the same
  tmux/session path as attach to compare UX behavior.
- Long term, split shell entry modes intentionally, for example:
  - raw container shell
  - tmux debug shell
  - logs/inspection shell
- Keep those as explicit named modes instead of one overloaded shell command.
- Revisit Starfleet mission-start order for API-backed stations.
- For `gce` and `local-docker`, prefer an API-first happy path:
  - hit `/health` first and launch immediately when the station API is already
    healthy
  - only run ignition diagnostics / wake / supervisor refresh when the API is
    unavailable or the launch fails due to infrastructure connectivity
- Keep local-worktree on its direct path and keep settings/auth sync in the
  normal launch path even when ignition is skipped.

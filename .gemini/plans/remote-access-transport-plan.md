# Remote Access Transport Plan

## Goal

Capture the next-step design for separating:

- **where a station comes from**: provider / provisioner
- **how Orbit reaches it**: transport / access mode

This plan is intentionally design-only. It does not authorize implementation in
this pass.

## Current State

Today Orbit has the right high-level seams, but the remote path is still too
coupled:

- Providers distinguish local vs remote reasonably well:
  - `local-worktree`
  - `local-docker`
  - `gce`
- There is already a transport abstraction:
  - identity/local
  - ssh
- The current GCE path assumes **raw direct SSH** and hardcodes the default GCE
  key path:
  - `~/.ssh/google_compute_engine`
- Orbit currently uses:
  - **ADC** for Pulumi / GCP API access
  - **raw ssh/rsync** for host access
- Orbit currently does **not** use:
  - `gcloud compute ssh`
  - IAP tunneling
  - a first-class self-hosted remote provider

## Current Pain Points

### Personal / fresh GCP projects

- ADC is required for Pulumi, but that is a separate auth path from SSH.
- `gcloud auth application-default login` does not create SSH keys.
- Orbit expects `google_compute_engine` keys to already exist.
- A brand new project may not have:
  - SSH keys
  - OS Login IAM
  - firewall rules
  - a routable internal DNS path

### Corporate / shared-network projects

- `manageNetworking: false` assumes the user already understands and controls:
  - VPC
  - subnet
  - firewall
  - DNS suffix behavior
- `direct-internal` is overloaded. It mixes routing assumptions with transport
  behavior.

### Architecture clarity

- Provider selection and transport selection are not yet modeled separately.
- `networkAccessType` is currently doing too much work.

## Proposed Model

### Provider Type

Provider answers: **who owns and provisions the machine?**

- `local-worktree`
- `local-docker`
- `gce`
- `self-hosted`

### Transport Type

Transport answers: **how do we connect to the host?**

- `ssh-direct`
  - private/internal DNS or private IP path
- `ssh-public`
  - public IP + user-managed SSH key
- `gcloud-ssh`
  - `gcloud compute ssh`
- `gcloud-iap`
  - `gcloud compute ssh --tunnel-through-iap`

This should replace or significantly narrow the meaning of `networkAccessType`.

## Recommended Mapping

### GCE

- `gce + ssh-direct`
  - current internal DNS / "magic path" approach
- `gce + ssh-public`
  - raw SSH to Pulumi-reported public IP
- `gce + gcloud-ssh`
  - GCE-native login path via `gcloud compute ssh`
- `gce + gcloud-iap`
  - no public IP required

### Self-Hosted

- `self-hosted + ssh-direct`
  - user-managed internal/private host
- `self-hosted + ssh-public`
  - user-managed public host

Non-goal for the first self-hosted cut:

- Orbit should not provision infrastructure for `self-hosted`
- Orbit should only orchestrate missions on an existing machine

## Why This Split Helps

- Personal GCP setup becomes much easier:
  - `gce + ssh-public` or `gce + gcloud-ssh`
- Corporate/shared VPC setup remains supported:
  - `gce + ssh-direct`
- User-managed boxes become first-class:
  - `self-hosted + ssh-public`
- Transport behavior becomes explicit in config and docs.

## Proposed Config Shape

### Future shape

```json
{
  "providerType": "gce",
  "transportType": "ssh-public",
  "projectId": "my-project",
  "zone": "us-central1-a",
  "instanceName": "starfleet-alpha",
  "manageNetworking": true
}
```

### Self-hosted example

```json
{
  "providerType": "self-hosted",
  "transportType": "ssh-public",
  "sshHost": "203.0.113.10",
  "sshUser": "matt",
  "sshKeyPath": "~/.ssh/id_ed25519"
}
```

## Migration Strategy

### Phase 1

- Keep `providerType` as-is
- Introduce `transportType`
- Map existing values conservatively:
  - `networkAccessType: "direct-internal"` -> `transportType: "ssh-direct"`
  - `networkAccessType: "external"` -> `transportType: "ssh-public"`

### Phase 2

- Add `self-hosted` provider
- Move host/user/key configuration into a dedicated self-hosted path

### Phase 3

- Add `gcloud-ssh` and `gcloud-iap`
- De-emphasize or remove `networkAccessType`

## File-Level Implementation Sketch

### Transport layer

- Add new transport implementations or strategies:
  - raw SSH direct/public
  - gcloud SSH
  - gcloud IAP SSH
- Keep the current `StationTransport` abstraction
- Ensure all transports support:
  - `exec`
  - `attach`
  - `sync`
  - `ensureTunnel`

### Provider factory

- `ProviderFactory` should choose:
  - provider from `providerType`
  - transport from `transportType`

### GCE provider

- GCE should stop assuming one SSH path
- GCE should consume whichever transport is selected

### Self-hosted provider

- No provisioner
- No Pulumi dependency
- Only remote orchestration

## Known Hard Parts

### Rsync parity

- raw SSH + rsync works well today
- `gcloud compute scp` is not a drop-in rsync replacement
- IAP + rsync may require a wrapper or fallback behavior

### Interactive attach

- raw SSH maps cleanly to `ssh -t`
- `gcloud compute ssh --command` is workable for non-interactive exec
- interactive tmux attach with `gcloud` needs careful testing

### Port forwarding

- current `ensureTunnel()` is raw `ssh -L`
- `gcloud-iap` likely needs its own tunnel strategy

### Auth clarity

- raw SSH:
  - host/user/key
- gcloud transport:
  - gcloud auth
  - possibly ADC for some flows
  - OS Login / IAM requirements

## Recommended First Increment

If and when this work starts, the highest-value first increment is:

1. Keep `gce`
2. Add `transportType`
3. Implement `ssh-public`
4. Document it as the default low-friction personal-project path

That gives immediate value without introducing IAP or self-hosted in the same
change.

## Test Plan When Implemented

- Behavior tests only
- No mock-heavy CLI argument-only coverage for critical path changes
- Validate:
  - `gce + ssh-direct`
  - `gce + ssh-public`
  - `self-hosted + ssh-public`
  - config migration from current schematics

## Open Questions

- Should `gcloud-ssh` and `gcloud-iap` be separate transport types or one
  transport with an `useIap` flag?
- Should `self-hosted` permit `gcloud-*` transports if the host is still a GCE
  instance, or should that stay exclusive to `gce`?

## Follow-Up TODOs

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

## TODO

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
